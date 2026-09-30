import pytest
from server.auth import normalize_username, hash_password, verify_password, new_token, token_hash, RateLimiter

def test_normalize_username():
    assert normalize_username("  Antonin ") == "antonin"
    assert normalize_username("a_b-9") == "a_b-9"
    for bad in ["", "   ", "a b", "é", "x" * 33, "a/b"]:
        assert normalize_username(bad) is None

def test_hash_and_verify():
    stored = hash_password("motdepasse")
    assert stored.startswith("scrypt$16384$8$1$")
    assert verify_password("motdepasse", stored)
    assert not verify_password("autre-chose", stored)
    assert hash_password("motdepasse") != stored          # sel aléatoire
    assert not verify_password("motdepasse", "n'importe quoi")

def test_tokens():
    t = new_token()
    assert len(t) >= 40 and t != new_token()
    assert token_hash(t) == token_hash(t) and len(token_hash(t)) == 64

def test_rate_limiter():
    clock = [1000.0]
    rl = RateLimiter(max_failures=5, window=900, now=lambda: clock[0])
    for _ in range(4):
        rl.fail("1.2.3.4")
    assert rl.retry_after("1.2.3.4") == 0
    rl.fail("1.2.3.4")
    assert rl.retry_after("1.2.3.4") == 900
    assert rl.retry_after("5.6.7.8") == 0
    clock[0] += 600
    assert rl.retry_after("1.2.3.4") == 300
    clock[0] += 300
    assert rl.retry_after("1.2.3.4") == 0
    rl.fail("5.6.7.8"); rl.reset("5.6.7.8")
    assert rl.retry_after("5.6.7.8") == 0
