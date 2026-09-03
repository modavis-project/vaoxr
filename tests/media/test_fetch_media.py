import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile


spec = importlib.util.spec_from_file_location("fetch_media", Path(__file__).resolve().parents[2] / "scripts/fetch-media.py")
media = importlib.util.module_from_spec(spec)
spec.loader.exec_module(media)


class MediaFetchTests(unittest.TestCase):
    def test_fixity(self):
        digest = hashlib.sha256(b"sample").hexdigest()
        media.verify(b"sample", 6, digest, "sample")
        with self.assertRaises(ValueError):
            media.verify(b"changed", 6, digest, "sample")

    def test_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ("../escape", "/absolute", "payload/../../escape", "payload\\escape", "payload/./file"):
                with self.subTest(name=name), self.assertRaises(ValueError):
                    media.safe_target(root, name)
            (root / "linked").symlink_to(root, target_is_directory=True)
            with self.assertRaises(ValueError):
                media.safe_target(root, "linked/file")

    def test_existing_files_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "payload" / "test"
            media.install(target, b"original")
            media.install(target, b"original")
            with self.assertRaises(ValueError):
                media.install(target, b"replacement")
            self.assertEqual(target.read_bytes(), b"original")

    def test_inventory_and_member_hashes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            carrier = root / "test.vao"
            workspace = root / "workspace"
            record = {"path": "payload/test", "byteSize": 4, "sha256": hashlib.sha256(b"test").hexdigest()}
            def write_carrier(payload, extra=False):
                with zipfile.ZipFile(carrier, "w") as archive:
                    for name in ("mimetype", "vao-manifest.json", "META-INF/vao-carrier.json"):
                        archive.writestr(name, b"")
                    archive.writestr("payload/test", payload)
                    if extra:
                        archive.writestr("../escape", b"bad")
            write_carrier(b"test", extra=True)
            with self.assertRaises(ValueError):
                media.extract_payload(carrier, workspace, {"id": record})
            write_carrier(b"fail")
            with self.assertRaises(ValueError):
                media.extract_payload(carrier, workspace, {"id": record})
            self.assertFalse(workspace.exists())
            write_carrier(b"test")
            media.extract_payload(carrier, workspace, {"id": record})
            self.assertEqual((workspace / "payload/test").read_bytes(), b"test")


if __name__ == "__main__":
    unittest.main()
