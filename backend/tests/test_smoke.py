async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


async def test_admin_me(admin_client, admin):
    r = await admin_client.get("/auth/me")
    assert r.status_code == 200
    assert r.json()["email"] == admin.email
    assert r.json()["is_admin"] is True
