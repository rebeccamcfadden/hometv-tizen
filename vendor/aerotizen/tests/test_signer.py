"""Sign a small app with throwaway certificates and verify the result like the TV would."""

import base64
import datetime
import hashlib
import re
import zipfile

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

from aerotizen import signer


@pytest.fixture
def certs(tmp_path):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "test")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(1)
        .not_valid_before(now)
        .not_valid_after(now + datetime.timedelta(days=1))
        .sign(key, hashes.SHA256())
    )
    enc = serialization.BestAvailableEncryption(b"pw")
    for role in ("author", "distributor"):
        (tmp_path / f"{role}.p12").write_bytes(
            pkcs12.serialize_key_and_certificates(role.encode(), key, cert, None, enc)
        )
    (tmp_path / "password.txt").write_text("pw")
    return tmp_path, key


@pytest.fixture
def app_dir(tmp_path):
    app = tmp_path / "app"
    app.mkdir()
    (app / "config.xml").write_text('<widget><tizen:application id="Abc1234567.App"/></widget>')
    (app / "index.html").write_text("<html>hi</html>")
    (app / "js").mkdir()
    (app / "js" / "main.js").write_text("console.log(1)")
    return app


def _b64sha512(data):
    return base64.b64encode(hashlib.sha512(data).digest()).decode()


def test_signed_package_verifies(certs, app_dir, tmp_path):
    cert_dir, key = certs
    out = tmp_path / "signed.wgt"
    signer.sign_wgt(str(app_dir), str(out), str(cert_dir))

    with zipfile.ZipFile(out) as z:
        names = z.namelist()
        assert names[:2] == ["author-signature.xml", "signature1.xml"]
        for sig_name, sig_id in (
            ("author-signature.xml", "AuthorSignature"),
            ("signature1.xml", "DistributorSignature"),
        ):
            xml = z.read(sig_name).decode()
            # SignedInfo is signed in its canonical (standalone) form.
            signed_info = re.search(r"<SignedInfo>.*?</SignedInfo>", xml).group(0)
            canonical = signed_info.replace("<SignedInfo>", f'<SignedInfo xmlns="{signer.DSIG}">', 1)
            signature = base64.b64decode(re.search(r"<SignatureValue>(.*?)</SignatureValue>", xml).group(1))
            key.public_key().verify(signature, canonical.encode(), padding.PKCS1v15(), hashes.SHA512())
            # Every file reference matches the packaged bytes.
            for uri, digest in re.findall(
                r'<Reference URI="([^"#][^"]*)">.*?<DigestValue>(.*?)</DigestValue>', xml
            ):
                assert digest == _b64sha512(z.read(uri)), uri
            # The #prop reference covers the canonical properties object.
            prop = re.search(r'<Reference URI="#prop">.*?<DigestValue>(.*?)</DigestValue>', xml).group(1)
            assert prop == _b64sha512(signer._prop_object(sig_id, True).encode())
        # The distributor signature also covers the author signature.
        assert 'URI="author-signature.xml"' in z.read("signature1.xml").decode()


def test_canonical_forms_are_c14n_fixed_points():
    etree = pytest.importorskip("lxml.etree")
    for sig_id in ("AuthorSignature", "DistributorSignature"):
        prop = signer._prop_object(sig_id, True)
        assert etree.tostring(etree.fromstring(prop).getroottree(), method="c14n").decode() == prop
