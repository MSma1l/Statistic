"""Test opțional de rate-limit pe /auth/login (10/minut).

Limiterul e dezactivat global în conftest (ca testele să nu fie flaky). Aici îl
reactivăm LOCAL, verificăm că depășirea pragului întoarce 429, apoi îl dezactivăm
la loc într-un `finally` ca să nu afectăm restul suitei.
"""

import pytest

from app.core.guard import limiter

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_login_rate_limit_429(client, make_user):
    await make_user("rl@x.com", password="parola123")
    limiter.enabled = True
    limiter.reset()
    try:
        statuses = []
        for _ in range(12):
            r = await client.post(
                "/auth/login", json={"email": "rl@x.com", "password": "gresita"}
            )
            statuses.append(r.status_code)
        # Pragul e 10/minut → cel puțin o cerere trebuie respinsă cu 429.
        assert 429 in statuses
    finally:
        limiter.reset()
        limiter.enabled = False
