"""Remove a stale batch lock while holding a kernel-owned recovery guard."""

import errno
import fcntl
import json
import os
import sys
import time


class LockConflict(Exception):
    pass


def process_is_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError as error:
        return error.errno != errno.ESRCH


def read_lock(path: str) -> bytes | None:
    try:
        with open(path, "rb") as lock:
            return lock.read()
    except FileNotFoundError:
        return None


def remove_stale_lock(path: str) -> None:
    previous = read_lock(path)
    if previous is None:
        return

    try:
        owner = json.loads(previous)
    except (ValueError, UnicodeDecodeError):
        owner = None
    valid_owner = (
        isinstance(owner, dict)
        and type(owner.get("pid")) is int
        and owner["pid"] > 0
        and isinstance(owner.get("token"), str)
    )
    if valid_owner and process_is_running(owner["pid"]):
        raise LockConflict
    if not valid_owner:
        try:
            modified_at = os.stat(path).st_mtime_ns
        except FileNotFoundError:
            return
        if time.time_ns() - modified_at < 30_000_000_000:
            raise LockConflict

    if read_lock(path) == previous:
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass


def main(lock_path: str) -> int:
    with open(f"{lock_path}.recovery", "a+b") as guard:
        try:
            fcntl.flock(guard, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 2
        try:
            remove_stale_lock(lock_path)
        except LockConflict:
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
