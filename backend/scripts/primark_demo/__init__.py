"""Primark full order-execution demo (inquiry -> export -> accounting) for the Lakhsma tenant.

Run inside Docker:
    docker compose exec backend python scripts/primark_demo/run.py            # write data
    docker compose exec backend python scripts/primark_demo/run.py --dry-run  # test, then roll back
"""
