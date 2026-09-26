import type { PreparedNode } from "../../scene-contract/src/prepared.ts";
import type { MotionEasing } from "../../scene-contract/src/motion-easing.ts";
type FrameWindow = {
  start: number;
  end: number;
  easing?: MotionEasing | undefined;
};
import type { Key, Property, Tracks } from "./prepared-scene.ts";

type Event = {
  start: number;
  end: number;
  value: number;
  step?: boolean;
  easing?: FrameWindow["easing"];
};

const baseValue = (node: PreparedNode, property: Property) => {
  if (property === "scaleX" || property === "scaleY" || property === "reveal")
    return 1;
  if (property === "state" || property === "gap" || property === "pulse")
    return 0;
  return node[property];
};

export function createFrameTracks(nodes: PreparedNode[]) {
  const properties = new Map<
    string,
    Map<Property, { initial: number; events: Event[] }>
  >();
  const get = (id: string, property: Property) => {
    let tracks = properties.get(id);
    if (!tracks) {
      tracks = new Map();
      properties.set(id, tracks);
    }
    let track = tracks.get(property);
    if (!track) {
      const node = nodes.find((node) => node.id === id);
      if (!node) throw new Error(`Missing story role ${id}`);
      track = { initial: baseValue(node, property), events: [] };
      tracks.set(property, track);
    }
    return track;
  };
  return {
    initial(id: string, property: Property, value: number) {
      get(id, property).initial = value;
    },
    add(id: string, property: Property, window: FrameWindow, value: number) {
      get(id, property).events.push({
        start: window.start,
        end: window.end,
        value,
        ...(window.easing ? { easing: window.easing } : {}),
      });
    },
    step(id: string, property: Property, at: number, value: number) {
      get(id, property).events.push({ start: at, end: at, value, step: true });
    },
    finish(): Record<string, Tracks> {
      return Object.fromEntries(
        [...properties].map(([id, properties]) => [
          id,
          Object.fromEntries(
            [...properties].map(([property, track]) => {
              const keys: Key[] = [{ time: 0, value: track.initial }];
              let previousEnd = -1;
              for (const event of track.events.sort(
                (a, b) => a.start - b.start,
              )) {
                if (
                  event.start < previousEnd ||
                  (event.step && event.start === previousEnd)
                )
                  throw new Error(
                    `Conflicting story events on ${id}.${property}`,
                  );
                const last = keys.at(-1)!;
                if (!event.step && event.start > last.time)
                  keys.push({ time: event.start, value: last.value });
                keys.push({
                  time: event.end,
                  value: event.value,
                  ...(event.step ? { step: true } : {}),
                  ...(event.easing ? { easing: event.easing } : {}),
                });
                previousEnd = event.end;
              }
              return [property, keys];
            }),
          ),
        ]),
      );
    },
  };
}
