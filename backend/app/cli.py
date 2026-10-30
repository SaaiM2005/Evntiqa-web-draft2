"""Admin account management.

python -m app.cli create-admin you@evntiqa.com      # prompts for a password
python -m app.cli set-password you@evntiqa.com      # resets it and signs out everywhere
python -m app.cli deactivate you@evntiqa.com
python -m app.cli list-admins
"""

import argparse
import asyncio
import getpass
import sys

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import select

from app.core.auth import MIN_PASSWORD_LENGTH, hash_password, revoke_all_sessions
from app.db.session import get_engine, get_sessionmaker
from app.models import AdminUser


def _email(value: str) -> str:
    try:
        return str(TypeAdapter(EmailStr).validate_python(value))
    except ValidationError:
        raise argparse.ArgumentTypeError(f"not a valid email: {value}") from None


def _read_password(from_stdin: bool) -> str:
    if from_stdin:
        password = sys.stdin.readline().rstrip("\n")
    else:
        password = getpass.getpass("Password: ")
        if getpass.getpass("Repeat password: ") != password:
            sys.exit("Passwords do not match.")
    if len(password) < MIN_PASSWORD_LENGTH:
        sys.exit(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
    return password


async def _run(args: argparse.Namespace) -> None:
    async with get_sessionmaker()() as session:
        if args.command == "list-admins":
            for admin in await session.scalars(select(AdminUser).order_by(AdminUser.created_at)):
                state = "active" if admin.is_active else "deactivated"
                print(f"{admin.email}\t{state}\tlast login: {admin.last_login_at or 'never'}")
            return

        user = await session.scalar(select(AdminUser).where(AdminUser.email == args.email))

        if args.command == "create-admin":
            if user is not None:
                sys.exit(f"{args.email} already exists. Use set-password to change it.")
            password = _read_password(args.password_stdin)
            session.add(AdminUser(email=args.email, password_hash=hash_password(password)))
            await session.commit()
            print(f"Created admin {args.email}")
            return

        if user is None:
            sys.exit(f"No admin with email {args.email}")

        if args.command == "set-password":
            user.password_hash = hash_password(_read_password(args.password_stdin))
            user.is_active = True
            await revoke_all_sessions(session, user)
            await session.commit()
            print(f"Password updated for {args.email}; existing sessions signed out")
        elif args.command == "deactivate":
            user.is_active = False
            await revoke_all_sessions(session, user)
            await session.commit()
            print(f"Deactivated {args.email}")
    await get_engine().dispose()


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("create-admin", "set-password"):
        p = sub.add_parser(name)
        p.add_argument("email", type=_email)
        p.add_argument("--password-stdin", action="store_true", help="read password from stdin")
    sub.add_parser("deactivate").add_argument("email", type=_email)
    sub.add_parser("list-admins")
    asyncio.run(_run(parser.parse_args()))


if __name__ == "__main__":
    main()
