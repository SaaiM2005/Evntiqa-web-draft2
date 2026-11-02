"""
Domain service for Author validation, duplicate detection, and fuzzy matching.
Prevents duplicate author entities from being created in both inline modals and masthead management.
"""

import difflib
import re
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.author import Author

# Similarity threshold for detecting duplicate or near-duplicate author names (85%)
FUZZY_SIMILARITY_THRESHOLD = 0.85


def normalize_author_name(name: str) -> str:
    """
    Normalizes an author name by:
    - Stripping leading/trailing whitespace
    - Removing common honorific titles (Dr., Prof., Mr., Mrs., Ms., Er.)
    - Removing punctuation
    - Lowercasing and condensing internal whitespace
    """
    if not name:
        return ""
    # Strip honorifics at start
    cleaned = re.sub(
        r"^(dr|prof|professor|mr|mrs|ms|miss|er)\.?\s+",
        "",
        name.strip(),
        flags=re.IGNORECASE,
    )
    # Remove punctuation
    cleaned = re.sub(r"[^\w\s]", "", cleaned)
    # Condense multiple spaces into single space and lowercase
    return " ".join(cleaned.lower().split())


def calculate_name_similarity(name1: str, name2: str) -> float:
    """
    Computes fuzzy similarity score between two author names in range [0.0, 1.0].
    Evaluates both positional sequence similarity and token-sorted similarity.
    """
    n1 = normalize_author_name(name1)
    n2 = normalize_author_name(name2)

    if not n1 or not n2:
        return 0.0

    if n1 == n2:
        return 1.0

    # 1. Positional SequenceMatcher ratio
    seq_ratio = difflib.SequenceMatcher(None, n1, n2).ratio()

    # 2. Token-sorted SequenceMatcher ratio (handles "Martin Yefim" vs "Yefim Martin")
    sorted_1 = " ".join(sorted(n1.split()))
    sorted_2 = " ".join(sorted(n2.split()))
    token_ratio = difflib.SequenceMatcher(None, sorted_1, sorted_2).ratio()

    return max(seq_ratio, token_ratio)


async def validate_author_uniqueness(
    db: AsyncSession,
    name: str,
    email: str | None = None,
    exclude_author_id: uuid.UUID | None = None,
) -> None:
    """
    Validates that a new or updated author does not conflict with existing authors:
    1. Email uniqueness (exact case-insensitive match)
    2. Exact / normalized name collision (100% match)
    3. Fuzzy name similarity collision (>= FUZZY_SIMILARITY_THRESHOLD)

    Raises HTTPException(409) if a duplicate or near-duplicate is detected.
    """
    stmt = select(Author)
    if exclude_author_id:
        stmt = stmt.where(Author.id != exclude_author_id)

    result = await db.execute(stmt)
    existing_authors = result.scalars().all()

    incoming_name_norm = normalize_author_name(name)
    incoming_email = email.strip().lower() if email else None

    highest_similarity = 0.0
    most_similar_author: Author | None = None

    for author in existing_authors:
        # 1. Check email uniqueness if email provided
        if incoming_email and author.email:
            if author.email.strip().lower() == incoming_email:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Author with email '{incoming_email}' already exists ('{author.name}')."
                    ),
                )

        # 2. Check exact (case-insensitive & normalized) name match
        author_name_norm = normalize_author_name(author.name)
        if author.name.strip().lower() == name.strip().lower() or (
            incoming_name_norm and author_name_norm and incoming_name_norm == author_name_norm
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"An author named '{author.name}' already exists. "
                    "Please select the existing author."
                ),
            )

        # 3. Calculate fuzzy similarity
        sim = calculate_name_similarity(name, author.name)
        if sim > highest_similarity:
            highest_similarity = sim
            most_similar_author = author

    # If fuzzy similarity meets or exceeds threshold, reject as duplicate
    if highest_similarity >= FUZZY_SIMILARITY_THRESHOLD and most_similar_author:
        pct = int(round(highest_similarity * 100))
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"A very similar author already exists: '{most_similar_author.name}' "
                f"({pct}% match). Please select the existing author or provide a distinct name."
            ),
        )
