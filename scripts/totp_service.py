#!/usr/bin/env python3
"""
Showhouse Google Authenticator TOTP Service
RFC 6238 compliant Two-Factor Authentication engine.
Uses pyotp, qrcode[pil], and cryptography (Fernet).
"""

import sys
import os
import io
import json
import time
import base64
import hashlib
import secrets
import argparse
import pyotp
from cryptography.fernet import Fernet
import qrcode

DEFAULT_ISSUER = os.environ.get("TOTP_ISSUER_NAME", "Showhouse")
DIGITS = int(os.environ.get("TOTP_DIGITS", "6"))
INTERVAL = int(os.environ.get("TOTP_INTERVAL", "30"))

def get_fernet_key() -> bytes:
    key_str = os.environ.get("TOTP_ENCRYPTION_KEY")
    if not key_str or not key_str.strip():
        # Fallback to deterministic default key if not in env
        key_str = "_1SeVzzl9Yy7YPDbQCMXi02xk2B_v9TU4JJdLnIUtZE="
    return key_str.strip().encode()

def cmd_generate_secret():
    secret = pyotp.random_base32(length=32)
    print(secret)

def cmd_provisioning_uri(args):
    totp = pyotp.TOTP(args.secret, digits=DIGITS, interval=INTERVAL)
    uri = totp.provisioning_uri(name=args.username, issuer_name=args.issuer or DEFAULT_ISSUER)
    print(uri)

def cmd_generate_qr(args):
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    qr.add_data(args.uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    print(f"data:image/png;base64,{b64}")

def cmd_verify_totp(args):
    totp = pyotp.TOTP(args.secret, digits=DIGITS, interval=INTERVAL)
    now_counter = int(time.time() // INTERVAL)
    is_valid = totp.verify(args.code.strip(), valid_window=args.window)
    result = {
        "valid": bool(is_valid),
        "counter": int(now_counter),
        "digits": DIGITS,
        "interval": INTERVAL
    }
    print(json.dumps(result))
    if not is_valid:
        sys.exit(1)

def cmd_encrypt(args):
    f = Fernet(get_fernet_key())
    token = f.encrypt(args.plaintext.strip().encode()).decode()
    print(token)

def cmd_decrypt(args):
    f = Fernet(get_fernet_key())
    try:
        plain = f.decrypt(args.token.strip().encode()).decode()
        print(plain)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

def cmd_generate_backup_codes(args):
    count = args.count or 10
    codes = []
    for _ in range(count):
        part1 = secrets.token_hex(2).upper()
        part2 = secrets.token_hex(2).upper()
        raw = f"{part1}-{part2}"
        h = hashlib.sha256(raw.upper().encode()).hexdigest()
        codes.append({"code": raw, "hash": h})
    print(json.dumps(codes))

def cmd_hash_code(args):
    h = hashlib.sha256(args.code.strip().upper().encode()).hexdigest()
    print(h)

def cmd_generate_code(args):
    totp = pyotp.TOTP(args.secret, digits=DIGITS, interval=INTERVAL)
    print(totp.now())

def main():
    parser = argparse.ArgumentParser(description="Showhouse TOTP CLI")
    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser("generate-secret")

    p_code = subparsers.add_parser("generate-code")
    p_code.add_argument("--secret", required=True)

    p_uri = subparsers.add_parser("provisioning-uri")
    p_uri.add_argument("--secret", required=True)
    p_uri.add_argument("--username", required=True)
    p_uri.add_argument("--issuer", default=DEFAULT_ISSUER)

    p_qr = subparsers.add_parser("generate-qr")
    p_qr.add_argument("--uri", required=True)

    p_verify = subparsers.add_parser("verify-totp")
    p_verify.add_argument("--secret", required=True)
    p_verify.add_argument("--code", required=True)
    p_verify.add_argument("--window", type=int, default=1)

    p_enc = subparsers.add_parser("encrypt")
    p_enc.add_argument("--plaintext", required=True)

    p_dec = subparsers.add_parser("decrypt")
    p_dec.add_argument("--token", required=True)

    p_bup = subparsers.add_parser("generate-backup-codes")
    p_bup.add_argument("--count", type=int, default=10)

    p_hash = subparsers.add_parser("hash-code")
    p_hash.add_argument("--code", required=True)

    args = parser.parse_args()

    if args.command == "generate-secret":
        cmd_generate_secret()
    elif args.command == "generate-code":
        cmd_generate_code(args)
    elif args.command == "provisioning-uri":
        cmd_provisioning_uri(args)
    elif args.command == "generate-qr":
        cmd_generate_qr(args)
    elif args.command == "verify-totp":
        cmd_verify_totp(args)
    elif args.command == "encrypt":
        cmd_encrypt(args)
    elif args.command == "decrypt":
        cmd_decrypt(args)
    elif args.command == "generate-backup-codes":
        cmd_generate_backup_codes(args)
    elif args.command == "hash-code":
        cmd_hash_code(args)
    else:
        parser.print_help()
        sys.exit(1)

if __name__ == "__main__":
    main()
