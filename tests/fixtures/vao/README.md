# VAO inspection fixtures

Source: [VAO Standard v0.6.0](https://github.com/modavis-project/vao-standard/tree/v0.6.0),
commit `9d477213eab90defa75bef0f44e0d292a83e68d9`.

| File | Source | SHA-256 |
| --- | --- | --- |
| `minimal-0.5.0.vao` | `Fixtures/VAO05/carriers/minimal.vao` | `9bc7ff7eb06cd50a66ab5bfeabdecaef68c8b24a15f5b47bc0013811a241403e` |
| `minimal-0.6.0.vao` | `Fixtures/VAO05/workspaces/minimal`, migrated by `Tools/migrate_vao05.py` and packed by `Tools/vao06.py` | `b5e34360a5ccff0c35244485a2acee895dbe35afe0f055a94abf7f1717f93588` |
| `mmic-1.0.0-roll.vao` | `Fixtures/MMIC/1.0.0/roll/preservation-closure.vao` | `74075ea61d7bc977715d38e0ea4a0fe3eb1941a9afc6c52898c86b3f001e6037` |

The first and third carriers retain the exact upstream bytes. The reference
validator accepts all three. The roll uses synthetic data, including a WAV
for the local preview test. See the carrier rights records and the upstream
fixture license notes.
