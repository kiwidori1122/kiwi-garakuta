#!/usr/bin/env python3
"""Check commits without echoing private values to terminal or CI logs."""
from __future__ import annotations

import argparse
import io
import os
from pathlib import Path
import re
import subprocess
import sys
import unicodedata
import zipfile

NAME = "kiwidori"
EMAIL = "360543408+kiwidori1122@users.noreply.github.com"
ALLOWED = {(NAME, EMAIL), ("GitHub", "noreply@github.com"),
           ("dependabot[bot]", "49699333+dependabot[bot]@users.noreply.github.com"),
           ("github-actions[bot]", "41898282+github-actions[bot]@users.noreply.github.com")}
MAX_ARCHIVE_BYTES = 256 * 1024 * 1024


class Blocked(Exception):
    pass


def git(*args: str) -> bytes:
    result = subprocess.run(["git", *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise Blocked("Git inspection failed; nothing was approved.")
    return result.stdout


def normalized(value: str) -> str:
    return unicodedata.normalize("NFKC", value).casefold()


class Scanner:
    def __init__(self) -> None:
        sources: list[str] = []
        explicit = os.environ.get("KIWI_GUARD_DENY_FILE")
        if explicit:
            try:
                sources.append(Path(explicit).read_text(encoding="utf-8-sig"))
            except (OSError, UnicodeError):
                raise Blocked("Cannot read the private deny file.") from None
        else:
            locations = [Path.home() / ".kiwi-guard/deny.txt"]
            if os.environ.get("USERPROFILE"):
                locations.append(Path(os.environ["USERPROFILE"]) / ".kiwi-guard/deny.txt")
            for path in dict.fromkeys(locations):
                if path.is_file():
                    try:
                        sources.append(path.read_text(encoding="utf-8-sig"))
                    except (OSError, UnicodeError):
                        raise Blocked("Cannot read the private deny file.") from None
        if os.environ.get("KIWI_GUARD_DENY"):
            sources.append(os.environ["KIWI_GUARD_DENY"].replace(",", "\n"))
        self.rules: list[tuple[str, bool]] = []
        for source in sources:
            for raw in source.splitlines():
                raw = raw.strip()
                if not raw or raw.startswith("#"):
                    continue
                exact = raw.startswith("=")
                word = normalized(raw[1:] if exact else raw)
                if not word:
                    raise Blocked("An empty private matching rule must be corrected.")
                self.rules.append((word, exact))
        if not self.rules:
            raise Blocked("Private deny rules are required. Run tools/setup-pc.bat.")
        self.scanned: set[str] = set()

    def text(self, value: str) -> None:
        value = normalized(value)
        for word, exact in self.rules:
            found = re.search(r"(?<!\w)" + re.escape(word) + r"(?!\w)", value) if exact else word in value
            if found:
                raise Blocked("Private information detected; values and paths are hidden.")

    def data(self, raw: bytes, depth: int = 0, budget: list[int] | None = None) -> None:
        if not raw.startswith((b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")):
            self.text(raw.decode("utf-8", errors="replace"))
            if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
                self.text(raw.decode("utf-16", errors="replace"))
            elif b"\x00" in raw:
                # Decode embedded ASCII wide strings, not arbitrary compressed bytes as Unicode.
                for pattern, encoding in ((rb"(?:[\x20-\x7e]\x00){4,}", "utf-16-le"),
                                          (rb"(?:\x00[\x20-\x7e]){4,}", "utf-16-be")):
                    for match in re.finditer(pattern, raw):
                        self.text(match.group().decode(encoding))
            return
        if depth >= 4:
            raise Blocked("Archive nesting exceeds inspection limits.")
        budget = budget if budget is not None else [MAX_ARCHIVE_BYTES]
        try:
            with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                if len(archive.infolist()) > 20000:
                    raise Blocked("Archive entry count exceeds inspection limits.")
                for item in archive.infolist():
                    self.text(item.filename)
                    if item.is_dir():
                        continue
                    budget[0] -= item.file_size
                    if budget[0] < 0:
                        raise Blocked("Archive size exceeds inspection limits.")
                    self.data(archive.read(item), depth + 1, budget)
        except (zipfile.BadZipFile, RuntimeError, OSError, NotImplementedError):
            raise Blocked("Archive cannot be inspected; nothing was approved.") from None

    def files(self, revision: str, names: bytes) -> None:
        tree = git("ls-tree", "-r", "-z", "--full-tree", revision) if revision else git("ls-files", "--stage", "-z")
        entries: dict[bytes, tuple[bytes, bytes]] = {}
        for row in tree.split(b"\0"):
            if not row:
                continue
            header, filename = row.split(b"\t", 1)
            fields = header.split()
            mode, oid = (fields[0], fields[2]) if revision else (fields[0], fields[1])
            if not revision and fields[2] != b"0":
                raise Blocked("Resolve index conflicts before inspection.")
            entries[filename] = (mode, oid)
        pending: list[bytes] = []
        for name in dict.fromkeys(names.split(b"\0")):
            if not name:
                continue
            self.data(name)
            if name not in entries:
                raise Blocked("A changed file could not be inspected.")
            mode, oid = entries[name]
            if mode == b"160000":
                raise Blocked("Submodule contents require separate inspection.")
            if oid.decode("ascii") not in self.scanned:
                pending.append(oid)
        if not pending:
            return
        result = subprocess.run(["git", "cat-file", "--batch"], input=b"\n".join(pending) + b"\n", stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode:
            raise Blocked("Blob inspection failed; nothing was approved.")
        cursor = 0
        for oid in pending:
            end = result.stdout.find(b"\n", cursor)
            header = result.stdout[cursor:end].split()
            if end < 0 or len(header) != 3 or header[0] != oid or header[1] != b"blob":
                raise Blocked("Invalid blob inspection result.")
            size = int(header[2])
            self.data(result.stdout[end + 1:end + 1 + size])
            cursor = end + size + 2
            self.scanned.add(oid.decode("ascii"))

    def identity(self, staged: bool = False, commit: str = "") -> None:
        if staged:
            for role in ("GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"):
                value = git("var", role).decode("utf-8", errors="replace").strip()
                if not value.startswith(f"{NAME} <{EMAIL}> "):
                    raise Blocked("Anonymous author and committer identity required.")
                self.text(value)
        else:
            fields = git("show", "-s", "--format=%an%x00%ae%x00%cn%x00%ce%x00%B", commit).decode("utf-8", errors="replace").split("\0", 4)
            if len(fields) != 5 or (fields[0], fields[1]) not in ALLOWED or (fields[2], fields[3]) not in ALLOWED:
                raise Blocked("Unapproved author or committer identity.")
            for value in fields:
                self.text(value)

    def staged(self) -> None:
        self.identity(staged=True)
        self.files("", git("diff", "--cached", "--name-only", "-z", "--no-renames", "--diff-filter=ACMT"))

    def commits(self, revisions: list[str]) -> int:
        commits = git("rev-list", *revisions).decode("ascii").splitlines()
        for commit in commits:
            try:
                self.identity(commit=commit)
                names = git("diff-tree", "--root", "-m", "-r", "--no-commit-id", "--name-only", "-z", "--no-renames", "--diff-filter=ACMT", commit)
                self.files(commit, names)
            except Blocked as error:
                raise Blocked(f"Commit {commit[:12]}: {error}") from None
        return len(commits)

    def push(self, stream: str) -> int:
        total = 0
        for line in stream.splitlines():
            parts = line.split()
            if len(parts) != 4:
                raise Blocked("Invalid pre-push input.")
            local_ref, local_sha, remote_ref, remote_sha = parts
            self.text(local_ref)
            self.text(remote_ref)
            if set(local_sha) == {"0"}:
                continue
            if not re.fullmatch(r"[0-9a-f]{40,64}", local_sha) or not re.fullmatch(r"[0-9a-f]{40,64}", remote_sha):
                raise Blocked("Invalid pre-push revision.")
            if local_ref.startswith("refs/tags/") and git("cat-file", "-t", local_sha).strip() == b"tag":
                raw = git("cat-file", "tag", local_sha)
                self.data(raw)
                tagger = next((x for x in raw.splitlines() if x.startswith(b"tagger ")), b"")
                if not tagger.startswith(f"tagger {NAME} <{EMAIL}> ".encode()):
                    raise Blocked("Anonymous tagger identity required.")
            revisions = [local_sha] if set(remote_sha) == {"0"} else [remote_sha + ".." + local_sha]
            total += self.commits(revisions)
        return total


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("staged", "message", "range", "push"))
    parser.add_argument("arguments", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    try:
        scanner = Scanner()
        if args.mode == "staged":
            scanner.staged()
        elif args.mode == "message":
            if len(args.arguments) != 1:
                raise Blocked("Commit message input is missing.")
            scanner.data(Path(args.arguments[0]).read_bytes())
        elif args.mode == "push":
            if len(args.arguments) != 2 or args.arguments[1] not in (
                "https://github.com/kiwidori1122/kiwi-garakuta.git",
                "https://github.com/kiwidori1122/kiwi-garakuta",
                "git@github.com:kiwidori1122/kiwi-garakuta.git",
            ):
                raise Blocked("Push target is not the current repository.")
            print(f"kiwi-guard: {scanner.push(sys.stdin.read())} outgoing commits checked.")
        else:
            print(f"kiwi-guard: {scanner.commits(args.arguments or ['HEAD'])} commits checked.")
        return 0
    except (Blocked, OSError, UnicodeError) as error:
        message = str(error) if isinstance(error, Blocked) else "Inspection failed; nothing was approved."
        print("kiwi-guard: BLOCKED. " + message, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
