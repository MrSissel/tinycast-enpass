# Test fixtures

`testvault/` is the public test vault from
[hazcod/enpass-cli](https://github.com/hazcod/enpass-cli) (MIT License).
Master password: `absolutely-No-clue` — tests pass it via the `MASTERPW`
environment variable. `snapshot.json` is real enpass-cli output captured from
that vault.

Never point a test at a real Enpass vault — not even for reads.
