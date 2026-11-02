import asyncio
import uuid
from sqlalchemy import select
from app.core.auth import hash_password
from app.db.session import get_sessionmaker
from app.models.admin import AdminUser

EMAIL = "admin@evntiqa.com"
PASSWORD = "admin123456"

async def seed_admin() -> None:
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        stmt = select(AdminUser).where(AdminUser.email == EMAIL)
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()
        if user:
            user.password_hash = hash_password(PASSWORD)
            user.is_active = True
            print(f"Updated existing admin user: {EMAIL}")
        else:
            user = AdminUser(
                id=uuid.uuid4(),
                email=EMAIL,
                password_hash=hash_password(PASSWORD),
                is_active=True,
            )
            session.add(user)
            print(f"Created new admin user: {EMAIL}")
        await session.commit()

if __name__ == "__main__":
    asyncio.run(seed_admin())
