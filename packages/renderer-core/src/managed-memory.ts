export type MemoryKind = "pixels" | "metadata";
export type MemoryLimits = { pixels: number; metadata: number };
export type MemoryLease = {
  readonly bytes: number;
  readonly active: boolean;
  resize(bytes: number): void;
  deferRelease(): () => void;
  release(): void;
};

/** Admission for declared application-owned bytes; physical process/driver RSS is separate. */
export class ManagedMemory {
  private readonly current: MemoryLimits = { pixels: 0, metadata: 0 };
  private readonly peak: MemoryLimits = { pixels: 0, metadata: 0 };
  private readonly leases = new Set<MemoryLease>();
  private readonly scratch = new Set<MemoryLease>();
  private readonly ownership = new WeakMap<object, MemoryLease>();
  private readonly resources = new Map<
    MemoryLease,
    { value: object; destroy?: (value: object) => void }
  >();
  private closed = false;
  private scratchActive = false;

  constructor(readonly limits: Readonly<MemoryLimits>) {
    for (const limit of [limits.pixels, limits.metadata])
      if (!Number.isSafeInteger(limit) || limit < 1)
        throw Error("Managed memory limits must be positive safe integers");
    this.limits = Object.freeze({ ...limits });
  }

  reserve(
    kind: MemoryKind,
    bytes: number,
    destroy?: () => void,
    retained = false,
  ): MemoryLease {
    if (kind !== "pixels" && kind !== "metadata")
      throw Error("Managed memory kind is invalid");
    if (this.leases.size >= 8192)
      throw Error("Managed memory control entries exceed their bound");
    let size = 0,
      released = false,
      holds = 0;
    const resize = (next: number) => {
      if (this.closed || released)
        throw Error("Managed memory reservation is disposed");
      if (!Number.isSafeInteger(next) || next < 0)
        throw Error("Managed memory reservation size is invalid");
      if (this.current[kind] - size + next > this.limits[kind])
        throw Error(
          `Composition managed ${kind} exceed their aggregate worker quota`,
        );
      this.current[kind] += next - size;
      size = next;
      this.peak[kind] = Math.max(this.peak[kind], this.current[kind]);
    };
    resize(bytes);
    const retire = () => {
      const resource = this.resources.get(lease);
      let failed = false;
      let reason: unknown;
      try {
        try {
          destroy?.();
        } catch (error) {
          failed = true;
          reason = error;
        }
        try {
          if (resource) resource.destroy?.(resource.value);
        } catch (error) {
          if (!failed) {
            failed = true;
            reason = error;
          }
        }
      } finally {
        if (resource) {
          this.ownership.delete(resource.value);
          delete (resource as Partial<typeof resource>).value;
          delete resource.destroy;
        }
        destroy = undefined;
        this.resources.delete(lease);
        this.scratch.delete(lease);
        this.leases.delete(lease);
        this.current[kind] -= size;
      }
      if (failed) throw reason;
    };
    const lease: MemoryLease = {
      get active() {
        return !released;
      },
      get bytes() {
        return size;
      },
      resize,
      /** Keep admission and actual owners until an already-started producer settles. */
      deferRelease: () => {
        if (this.closed || released)
          throw Error("Managed memory reservation is disposed");
        holds++;
        let settled = false;
        return () => {
          if (settled) return;
          settled = true;
          holds--;
          if (released && !holds) retire();
        };
      },
      release: () => {
        if (released) return;
        released = true;
        if (!holds) retire();
      },
    };
    this.leases.add(lease);
    if (this.scratchActive && !retained) this.scratch.add(lease);
    return lease;
  }

  /** Reserve before calling an allocator, and release admission if it throws. */
  allocate<T extends object>(
    kind: MemoryKind,
    bytes: number,
    factory: () => T,
    retained = false,
    identity: (value: T) => object = (value) => value,
    destroy?: (value: object) => void,
  ): T {
    const lease = this.reserve(kind, bytes, undefined, retained);
    try {
      const value = factory();
      const owner = identity(value);
      this.adopt(owner, lease, destroy);
      return value;
    } catch (error) {
      lease.release();
      throw error;
    }
  }

  adopt(
    value: object,
    lease: MemoryLease,
    destroy?: (value: object) => void,
  ): void {
    if (!this.leases.has(lease) || !lease.active)
      throw Error("Managed resource reservation has no active owner");
    if (this.resources.has(lease))
      throw Error("Managed reservation already has a resource owner");
    if (this.ownership.has(value))
      throw Error("Managed allocation returned an already owned resource");
    this.ownership.set(value, lease);
    this.resources.set(lease, { value, ...(destroy ? { destroy } : {}) });
  }

  retain(value: object): void {
    const lease = this.ownership.get(value);
    if (!lease?.active)
      throw Error("Managed retained resource has no admitted owner");
    this.scratch.delete(lease);
  }

  /** A BYOB byte stream transfers the admitted backing store without allocating a second owner. */
  transfer(previous: object, next: object): void {
    const lease = this.ownership.get(previous);
    if (!lease?.active || !this.leases.has(lease))
      throw Error("Managed transfer has no active admitted owner");
    if (previous === next) return;
    if (this.ownership.has(next))
      throw Error("Managed transfer target already has an owner");
    this.ownership.delete(previous);
    this.ownership.set(next, lease);
    this.resources.get(lease)!.value = next;
  }

  release(value: object): void {
    this.ownership.get(value)?.release();
  }

  /** Retiring owners remain charged and observable until their destructors finish. */
  owns(value: object): boolean {
    return this.ownership.has(value);
  }

  /** Scratch remains charged through capture/upload; retained resources cross this boundary explicitly. */
  beginScratch(): void {
    if (this.closed || this.scratchActive || this.scratch.size)
      throw Error("Managed scratch phases must be open and sequential");
    this.scratchActive = true;
  }
  endScratch(): void {
    if (!this.scratchActive) throw Error("Managed scratch phase is not active");
    this.scratchActive = false;
    this.releaseAll(this.scratch);
  }

  /** Construction commits every admitted object that belongs to the successful preview. */
  commitScratch(): void {
    if (!this.scratchActive) throw Error("Managed scratch phase is not active");
    this.scratch.clear();
    this.scratchActive = false;
  }
  get hasScratch(): boolean {
    return this.scratchActive;
  }

  get statistics() {
    return {
      scope: "declared-application-owned-bytes" as const,
      limits: { ...this.limits },
      current: { ...this.current },
      peak: { ...this.peak },
      reservations: this.leases.size,
    };
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.scratchActive = false;
    this.releaseAll(this.leases);
  }

  private releaseAll(leases: Set<MemoryLease>): void {
    let failed = false;
    let reason: unknown;
    for (const lease of leases) {
      try {
        lease.release();
      } catch (error) {
        if (!failed) reason = error;
        failed = true;
      }
    }
    if (failed) throw reason;
  }
}
