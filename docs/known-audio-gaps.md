# Known audio gaps

**Measured 2026-07-26.** Enforced by `scripts/coverage.test.mjs`.

| | |
|---|---|
| Syllables the annotator can emit | 1,814 |
| Audio files shipped | 3,884 |
| **Missing audio** | **14** |
| Audio files never emitted by the annotator | 2,084 |

Coverage is **99.2%** of emittable syllables.

## The 14 missing syllables

| Syllable | Example character | Note |
|---|---|---|
| `m4` | 唔 | **The one that matters.** Cantonese negation particle — very high frequency in colloquial speech and lyrics |
| `m2` | 呣 | Syllabic nasal interjection |
| `ng4` | 㐚 | Syllabic nasal |
| `ng5` | 㐅 | Syllabic nasal |
| `ng6` | 㕶 | Syllabic nasal |
| `hm1` | 噷 | Interjection |
| `oi1` | 㗒 | Rare |
| `oi2` | 叆 | Rare |
| `oi3` | 㤅 | Rare |
| `gak1` | 呄 | Rare |
| `kwang1` | 㚚 | Rare |
| `nak6` | 䅞 | Rare |
| `noek6` | 蹃 | Rare |
| `teot1` | 䠈 | Rare |

Thirteen are rare or obscure. **`m4` (唔) is not** — it is one of the most frequent characters in written Cantonese, so this gap is user-visible.

## Why they are missing

The audio set is the `amazonHiuJin` subset of [`AlienKevin/cantone`](https://huggingface.co/datasets/AlienKevin/cantone). All 14 syllables are absent from that subset.

They **do** exist in the same dataset's `microsoftHiuGaai`, `microsoftHiuMaan` and `microsoftWanLung` voices. Those are deliberately not used:

> Amazon Polly is the only vendor with an explicit written grant permitting generated speech to be cached and redistributed. Microsoft has never publicly stated a position on redistributing Azure Speech output, and informal guidance is not to redistribute it outside your application. This repository is public, so committing Microsoft-generated audio is precisely the question we do not want to litigate.

So this gap is a direct, known cost of the licensing decision — not a defect.

## Behaviour in the app

A character whose syllable has no audio is still rendered and still shows its Jyutping and gloss. It is marked with a dotted underline, and tapping it explains that no audio is available. Nothing throws, nothing is silent-without-explanation.

## How to close the gap

Generate the syllable set with Amazon Polly directly, using its native Jyutping phoneme alphabet:

```
<phoneme alphabet="x-amazon-jyutping" ph="m4">唔</phoneme>
```

This is already the documented clean-provenance upgrade path — it removes reliance on a third party's licence assertion and closes all 14 gaps at once. Estimated cost is under US$2, or free under Polly's 1M-character tier. The file layout is unchanged, so it is a drop-in asset swap requiring no code change.
