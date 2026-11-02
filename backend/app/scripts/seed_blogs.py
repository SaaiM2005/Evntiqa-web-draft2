import asyncio
from datetime import UTC, datetime

from sqlalchemy import select

from app.db.session import get_sessionmaker
from app.models.author import Author
from app.models.category import Category
from app.models.content import ContentItem, ContentStatus, ContentType

CATEGORIES_DATA = [
    {"name": "CISO Engagement", "slug": "engagement", "description": "Engaging senior security executives"},
    {"name": "ABM", "slug": "abm", "description": "Account-Based Marketing playbooks"},
    {"name": "Roundtables", "slug": "roundtables", "description": "Virtual and physical executive benchmarking"},
    {"name": "Field Marketing", "slug": "field", "description": "Field events and regional programs"},
    {"name": "Pipeline", "slug": "pipeline", "description": "Enterprise opportunity acceleration and reactivation"},
    {"name": "AI & Cloud", "slug": "ai-cloud", "description": "Artificial intelligence and cloud architecture security"},
    {"name": "Cyber Security", "slug": "cyber-security", "description": "Threat intelligence and defense infrastructure"},
]

AUTHORS_DATA = [
    {
        "name": "Dr. Aris Thorne",
        "designation": "Chief Cryptographer & Security Fellow",
        "email": "aris.thorne@evntiqa.com",
        "avatar_url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80",
        "description": "Dr. Thorne researches zero trust cryptographic protocols and high-throughput network isolation.",
    },
    {
        "name": "Dr. Sarah Jenkins",
        "designation": "Head of Data Architecture",
        "email": "sarah.jenkins@evntiqa.com",
        "avatar_url": "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=200&q=80",
        "description": "Specializes in multi-tenant data pipelines, lakehouse governance, and enterprise security frameworks.",
    },
    {
        "name": "Marcus Vance",
        "designation": "Principal Threat Analyst",
        "email": "marcus.vance@evntiqa.com",
        "avatar_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80",
        "description": "Marcus analyzes emerging cyber threats, vulnerability trends, and CISO threat containment strategies.",
    },
]

ARTICLES_DATA = [
    {
        "title": "Why one-time CISO events stall pipeline, and what continuous engagement fixes",
        "slug": "why-one-time-ciso-events-stall-pipeline",
        "type": ContentType.ARTICLE,
        "cat_slug": "engagement",
        "author_name": "Dr. Aris Thorne",
        "is_primary_featured": True,
        "brief": "A single dinner or webinar can open a door, but it rarely keeps it open. We look at where engagement drops off between events and how a steady cadence of peer-led conversations keeps priority accounts moving.",
        "content": """
<p>A single executive dinner or high-profile webinar can open an enterprise door, but it rarely keeps it open. In enterprise security marketing, momentum is lost in the dead space between disparate events.</p>
<h2>The Engagement Chasm Between One-Off Events</h2>
<p>When security vendors rely strictly on quarterly or annual flagship events, account relationships go cold within 14 days of the post-event thank you email. Security executives move on to urgent patch cycles, board meetings, and active incidents.</p>
<blockquote>"The secret to moving priority accounts through the pipeline isn't a bigger stage; it's a tighter, continuous loop of peer interactions."</blockquote>
<h2>The 4 Pillars of Continuous Cadence</h2>
<ul>
  <li><strong>Consistent Room Cadence:</strong> Bi-monthly benchmarking sessions rather than standalone annual extravaganzas.</li>
  <li><strong>Unfiltered Peer Facilitation:</strong> Neutral, vendor-agnostic discussions centered strictly around operational challenges.</li>
  <li><strong>Immediate Insight Synthesis:</strong> Providing attendees with anonymized benchmarking briefs within 48 hours.</li>
  <li><strong>Account Intelligence Handoff:</strong> Seamlessly arming enterprise sales teams with strategic account context.</li>
</ul>
<p>By shifting from transactional sponsorship to continuous peer engagement, cybersecurity revenue leaders accelerate pipeline velocity by more than 3x.</p>
""",
        "published_at": datetime(2026, 10, 22, 10, 0, tzinfo=UTC),
        "reading_time_minutes": 7,
    },
    {
        "title": "Building a target account list CISOs will actually respond to",
        "slug": "building-target-account-list-cisos-respond",
        "type": ContentType.ARTICLE,
        "cat_slug": "abm",
        "author_name": "Marcus Vance",
        "is_primary_featured": False,
        "brief": "Start from buying groups, not firmographics, and map the security leaders who shape each deal.",
        "content": "<p>Generic account-based marketing lists fail because they focus on company size instead of security governance topology. Mapping the actual risk stakeholders inside target enterprises unlocks response rates over 45%.</p>",
        "published_at": datetime(2026, 10, 15, 12, 0, tzinfo=UTC),
        "reading_time_minutes": 6,
    },
    {
        "title": "Inside a virtual CISO roundtable: what 10–12 peers need to speak openly",
        "slug": "inside-virtual-ciso-roundtable",
        "type": ContentType.BLOG,
        "cat_slug": "roundtables",
        "author_name": "Dr. Sarah Jenkins",
        "is_primary_featured": False,
        "brief": "Group size, moderation, and confidentiality rules that turn a call into a real benchmarking session.",
        "content": "<p>When security leaders enter a room with strict Chatham House rules and zero vendor pitches, the conversation transforms into candid operational benchmarking.</p>",
        "published_at": datetime(2026, 10, 8, 14, 0, tzinfo=UTC),
        "reading_time_minutes": 5,
    },
    {
        "title": "Reactivating stalled accounts with peer-led conversations",
        "slug": "reactivating-stalled-accounts-peer-conversations",
        "type": ContentType.ARTICLE,
        "cat_slug": "pipeline",
        "author_name": "Marcus Vance",
        "is_primary_featured": False,
        "brief": "When outreach goes quiet, an invitation to sit with peers can restart the relationship on new terms.",
        "content": "<p>Enterprise deals stall for dozens of reasons—re-orgs, shifting budgets, or evaluation fatigue. An invitation to an exclusive peer forum breaks the deadlock without sales friction.</p>",
        "published_at": datetime(2026, 10, 1, 9, 30, tzinfo=UTC),
        "reading_time_minutes": 6,
    },
    {
        "title": "Field marketing in 2027: fewer events, deeper executive relationships",
        "slug": "field-marketing-2027-executive-relationships",
        "type": ContentType.BLOG,
        "cat_slug": "field",
        "author_name": "Dr. Aris Thorne",
        "is_primary_featured": False,
        "brief": "Why field teams are trading large booths for smaller, recurring rooms with the right security leaders.",
        "content": "<p>The era of 100-person generic trade show happy hours is over. High-performing revenue marketing teams now focus budget on intimate, targeted executive spaces.</p>",
        "published_at": datetime(2026, 9, 24, 11, 0, tzinfo=UTC),
        "reading_time_minutes": 4,
    },
    {
        "title": "The post-event handoff: turning a roundtable into a sales conversation",
        "slug": "post-event-handoff-sales-conversation",
        "type": ContentType.ARTICLE,
        "cat_slug": "pipeline",
        "author_name": "Dr. Sarah Jenkins",
        "is_primary_featured": False,
        "brief": "What to capture in the room, what to send within 48 hours, and how sales should follow up.",
        "content": "<p>Closing the loop after a roundtable requires contextual relevance. We break down the exact SLA and cadence between marketing and sales account executives.</p>",
        "published_at": datetime(2026, 9, 17, 10, 0, tzinfo=UTC),
        "reading_time_minutes": 5,
    },
    {
        "title": "How to recruit CISOs without adding to their outreach fatigue",
        "slug": "recruit-cisos-without-outreach-fatigue",
        "type": ContentType.ARTICLE,
        "cat_slug": "engagement",
        "author_name": "Marcus Vance",
        "is_primary_featured": False,
        "brief": "Security leaders ignore most invitations. The ones they accept offer peers, privacy, and a clear agenda.",
        "content": "<p>Enterprise CISOs receive over 50 cold messages every single week. Standing out requires an executive-to-executive approach rooted in respect for their time.</p>",
        "published_at": datetime(2026, 9, 10, 15, 0, tzinfo=UTC),
        "reading_time_minutes": 6,
    },
]


async def seed() -> None:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as db:
        # Seed categories
        cat_map = {}
        for c_data in CATEGORIES_DATA:
            existing = (
                await db.execute(select(Category).where(Category.slug == c_data["slug"]))
            ).scalar_one_or_none()
            if not existing:
                cat = Category(
                    name=c_data["name"],
                    slug=c_data["slug"],
                    description=c_data["description"],
                )
                db.add(cat)
                await db.flush()
                cat_map[c_data["slug"]] = cat
            else:
                cat_map[c_data["slug"]] = existing

        # Seed authors
        author_map = {}
        for a_data in AUTHORS_DATA:
            existing = (
                await db.execute(select(Author).where(Author.name == a_data["name"]))
            ).scalar_one_or_none()
            if not existing:
                author = Author(
                    name=a_data["name"],
                    designation=a_data["designation"],
                    email=a_data["email"],
                    avatar_url=a_data["avatar_url"],
                    description=a_data["description"],
                )
                db.add(author)
                await db.flush()
                author_map[a_data["name"]] = author
            else:
                author_map[a_data["name"]] = existing

        # Seed content items
        for art in ARTICLES_DATA:
            existing = (
                await db.execute(select(ContentItem).where(ContentItem.slug == art["slug"]))
            ).scalar_one_or_none()
            if not existing:
                item = ContentItem(
                    title=art["title"],
                    slug=art["slug"],
                    type=art["type"],
                    brief=art["brief"],
                    content=art["content"],
                    status=ContentStatus.PUBLISHED,
                    is_primary_featured=art["is_primary_featured"],
                    published_at=art["published_at"],
                    reading_time_minutes=art["reading_time_minutes"],
                    category_id=cat_map[art["cat_slug"]].id if art["cat_slug"] in cat_map else None,
                    author_id=author_map[art["author_name"]].id if art["author_name"] in author_map else None,
                )
                db.add(item)

        await db.commit()
        print("Successfully seeded categories, authors, and initial blog posts!")


if __name__ == "__main__":
    asyncio.run(seed())
