"""Integration cases use only invented identities and a disposable local repo."""
from __future__ import annotations

import importlib.util
import io
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import zipfile
from unittest.mock import patch

SOURCE_ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("guard", SOURCE_ROOT / "tools/guard/guard.py")
guard = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(guard)


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name)
        self.previous = Path.cwd()
        os.chdir(self.repo)
        self.rules = self.repo / "private-rules.txt"
        self.rules.write_text("PrivateExample\n仮名字\n=sampleword\n", encoding="utf-8")
        self.environment = patch.dict(os.environ, {"KIWI_GUARD_DENY_FILE": str(self.rules), "KIWI_GUARD_DENY": "", "GIT_CONFIG_COUNT": "0"})
        self.environment.start()
        self.git("init", "-q")
        self.git("config", "user.name", guard.NAME)
        self.git("config", "user.email", guard.EMAIL)
        self.git("config", "commit.gpgsign", "false")
        self.git("config", "core.autocrlf", "false")

    def tearDown(self):
        self.environment.stop()
        os.chdir(self.previous)
        self.tmp.cleanup()

    def git(self, *args):
        result = subprocess.run(["git", *args], capture_output=True)
        if result.returncode:
            log = SOURCE_ROOT / "data/guard-review"
            log.mkdir(parents=True, exist_ok=True)
            (log / "fixture-error-private.txt").write_bytes(result.stderr)
        self.assertEqual(result.returncode, 0, "fixture Git command failed")
        return result.stdout.decode("utf-8").strip()

    def stage(self, filename="safe.txt", data=b"safe content"):
        (self.repo / filename).write_bytes(data)
        self.git("add", "--", filename)

    def commit(self, message="Fixture change"):
        self.git("commit", "-q", "-m", message)
        return self.git("rev-parse", "HEAD")

    def test_safe_staged(self):
        self.stage()
        guard.Scanner().staged()

    def test_author_override(self):
        with patch.dict(os.environ, {"GIT_AUTHOR_NAME": "Unapproved Example"}):
            with self.assertRaises(guard.Blocked): guard.Scanner().staged()

    def test_committer_override(self):
        with patch.dict(os.environ, {"GIT_COMMITTER_EMAIL": "test@example.invalid"}):
            with self.assertRaises(guard.Blocked): guard.Scanner().staged()

    def test_unicode_filename(self):
        self.stage("仮名字.txt")
        with self.assertRaises(guard.Blocked): guard.Scanner().staged()

    def test_case_and_compatibility(self):
        with self.assertRaises(guard.Blocked): guard.Scanner().text("ＰＲＩＶＡＴＥＥＸＡＭＰＬＥ")

    def test_word_rule(self):
        guard.Scanner().text("presamplewordpost")
        with self.assertRaises(guard.Blocked): guard.Scanner().text("/SampleWord/")

    def test_utf16(self):
        self.stage(data="PrivateExample".encode("utf-16-le"))
        with self.assertRaises(guard.Blocked): guard.Scanner().staged()

    def test_zip_contents(self):
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr("safe.txt", "PrivateExample")
        self.stage("package.zip", out.getvalue())
        with self.assertRaises(guard.Blocked): guard.Scanner().staged()

    def test_zip_names(self):
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w") as z: z.writestr("仮名字.txt", "safe")
        with self.assertRaises(guard.Blocked): guard.Scanner().data(out.getvalue())

    def test_missing_rules_blocks(self):
        self.rules.write_text("", encoding="utf-8")
        with self.assertRaises(guard.Blocked): guard.Scanner()

    def test_history_checks_complete_blobs(self):
        self.stage(data=b"PrivateExample")
        self.commit()
        self.stage(data=b"safe")
        self.commit()
        with self.assertRaises(guard.Blocked): guard.Scanner().commits(["HEAD"])

    def test_history_checks_names(self):
        self.stage()
        self.git("config", "user.name", "Unapproved Example")
        self.commit()
        with self.assertRaises(guard.Blocked): guard.Scanner().commits(["HEAD"])

    def test_new_ref_checks_existing_objects(self):
        self.stage(data=b"PrivateExample")
        sha = self.commit()
        with self.assertRaises(guard.Blocked):
            guard.Scanner().push(f"refs/heads/new {sha} refs/heads/new {'0'*40}\n")

    def test_annotated_tag_name(self):
        self.stage(); self.commit()
        self.git("config", "user.name", "Unapproved Example")
        self.git("tag", "-a", "fixture", "-m", "Fixture")
        sha = self.git("rev-parse", "fixture")
        with self.assertRaises(guard.Blocked):
            guard.Scanner().push(f"refs/tags/fixture {sha} refs/tags/fixture {'0'*40}\n")

    def test_message_hides_value(self):
        message = self.repo / "message.txt"
        message.write_text("PrivateExample", encoding="utf-8")
        with patch("sys.stderr", new_callable=io.StringIO) as stream:
            self.assertEqual(guard.main(["message", str(message)]), 1)
            self.assertNotIn("PrivateExample", stream.getvalue())
            self.assertNotIn(str(message), stream.getvalue())

    def test_ref_name(self):
        self.stage(); sha = self.commit()
        with self.assertRaises(guard.Blocked):
            guard.Scanner().push(f"refs/tags/PrivateExample {sha} refs/tags/PrivateExample {'0'*40}\n")

    def test_wrong_push_target(self):
        with patch("sys.stderr", new_callable=io.StringIO):
            self.assertEqual(guard.main(["push", "origin", "https://example.invalid/old.git"]), 1)

    def test_real_hooks(self):
        source = SOURCE_ROOT
        shutil.copytree(source / "tools/guard", self.repo / "tools/guard")
        shutil.copytree(source / ".githooks", self.repo / ".githooks")
        self.git("config", "core.hooksPath", ".githooks")
        self.stage()
        self.commit("Safe fixture")
        self.stage("blocked.txt", b"PrivateExample")
        result = subprocess.run(["git", "commit", "-m", "Safe fixture"], capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(b"PrivateExample", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
