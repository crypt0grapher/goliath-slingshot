# Task 004: Translate Revert Error Messages to All Supported Languages

## Context
The CoolSwap-interface uses i18next with 22 supported locales stored in `public/locales/<lang>.json`. Task 002 adds custom Solidity error decoding that maps error selectors to i18n keys. This task adds the actual translations for those new keys to all 22 locale files, including Russian.

The project has a key parity test (`src/__tests__/i18n/keyParity.test.ts`) that fails the build if any locale file is missing keys present in `en.json`. All 22 files must be updated in sync.

The new i18n keys to add (from task-002's error selector map):

| Key | English (en) |
|-----|-------------|
| `yield.errorZeroAmount` | Amount must be greater than zero |
| `yield.errorInsufficientBalance` | Insufficient stXCN balance for this operation |
| `yield.errorInsufficientContractBalance` | Insufficient contract balance — please try a smaller amount |
| `yield.errorTransferFailed` | Transfer failed |
| `yield.errorGasEstimationFailed` | Could not estimate gas — transaction submitted with default gas limit |

## Task

Add the 5 new i18n keys to all 22 locale files in `public/locales/`:

**Locale files to update (22 total):**

| File | Language | Translations |
|------|----------|-------------|
| `en.json` | English | Amount must be greater than zero / Insufficient stXCN balance for this operation / Insufficient contract balance — please try a smaller amount / Transfer failed / Could not estimate gas — transaction submitted with default gas limit |
| `ru.json` | Russian | Сумма должна быть больше нуля / Недостаточный баланс stXCN для этой операции / Недостаточный баланс контракта — попробуйте меньшую сумму / Перевод не удался / Не удалось оценить газ — транзакция отправлена с лимитом газа по умолчанию |
| `ar.json` | Arabic | يجب أن يكون المبلغ أكبر من صفر / رصيد stXCN غير كافٍ لهذه العملية / رصيد العقد غير كافٍ — يرجى تجربة مبلغ أصغر / فشل التحويل / تعذّر تقدير الغاز — تم إرسال المعاملة بحد غاز افتراضي |
| `az.json` | Azerbaijani | Məbləğ sıfırdan böyük olmalıdır / Bu əməliyyat üçün stXCN balansı kifayət deyil / Müqavilə balansı kifayət deyil — daha kiçik məbləğ yoxlayın / Transfer uğursuz oldu / Qaz qiymətləndirməsi alınmadı — tranzaksiya standart qaz limiti ilə göndərildi |
| `de.json` | German | Betrag muss größer als Null sein / Unzureichendes stXCN-Guthaben für diese Operation / Unzureichendes Vertragsguthaben — bitte versuchen Sie einen kleineren Betrag / Übertragung fehlgeschlagen / Gasschätzung fehlgeschlagen — Transaktion mit Standard-Gaslimit gesendet |
| `es.json` | Spanish | La cantidad debe ser mayor que cero / Saldo de stXCN insuficiente para esta operación / Saldo del contrato insuficiente — intente con una cantidad menor / Transferencia fallida / No se pudo estimar el gas — transacción enviada con límite de gas predeterminado |
| `es-AR.json` | Spanish (Argentina) | El monto debe ser mayor que cero / Saldo de stXCN insuficiente para esta operación / Saldo del contrato insuficiente — intentá con un monto menor / Transferencia fallida / No se pudo estimar el gas — transacción enviada con límite de gas predeterminado |
| `es-US.json` | Spanish (USA) | La cantidad debe ser mayor que cero / Saldo de stXCN insuficiente para esta operación / Saldo del contrato insuficiente — intente con una cantidad menor / Transferencia fallida / No se pudo estimar el gas — transacción enviada con límite de gas predeterminado |
| `fr.json` | French | Le montant doit être supérieur à zéro / Solde stXCN insuffisant pour cette opération / Solde du contrat insuffisant — veuillez essayer un montant plus petit / Échec du transfert / Impossible d'estimer le gas — transaction envoyée avec la limite de gas par défaut |
| `id.json` | Indonesian | Jumlah harus lebih besar dari nol / Saldo stXCN tidak cukup untuk operasi ini / Saldo kontrak tidak cukup — coba jumlah yang lebih kecil / Transfer gagal / Tidak dapat memperkirakan gas — transaksi dikirim dengan batas gas default |
| `it-IT.json` | Italian | L'importo deve essere maggiore di zero / Saldo stXCN insufficiente per questa operazione / Saldo del contratto insufficiente — prova con un importo inferiore / Trasferimento fallito / Impossibile stimare il gas — transazione inviata con limite gas predefinito |
| `iw.json` | Hebrew | הסכום חייב להיות גדול מאפס / יתרת stXCN אינה מספיקה לפעולה זו / יתרת החוזה אינה מספיקה — נסו סכום קטן יותר / ההעברה נכשלה / לא ניתן לאמוד גז — העסקה נשלחה עם מגבלת גז ברירת מחדל |
| `ja.json` | Japanese | 金額はゼロより大きくなければなりません / この操作に必要なstXCN残高が不足しています / コントラクト残高が不足しています — より少ない金額をお試しください / 送金に失敗しました / ガスの見積もりができませんでした — デフォルトのガスリミットで送信されました |
| `ko.json` | Korean | 금액은 0보다 커야 합니다 / 이 작업을 위한 stXCN 잔액이 부족합니다 / 컨트랙트 잔액이 부족합니다 — 더 적은 금액을 시도해 주세요 / 전송 실패 / 가스를 추정할 수 없습니다 — 기본 가스 한도로 트랜잭션이 전송되었습니다 |
| `nl.json` | Dutch | Bedrag moet groter zijn dan nul / Onvoldoende stXCN-saldo voor deze bewerking / Onvoldoende contractsaldo — probeer een kleiner bedrag / Overdracht mislukt / Kon gas niet schatten — transactie verzonden met standaard gaslimiet |
| `pt-BR.json` | Portuguese (Brazil) | O valor deve ser maior que zero / Saldo de stXCN insuficiente para esta operação / Saldo do contrato insuficiente — tente um valor menor / Transferência falhou / Não foi possível estimar o gás — transação enviada com limite de gás padrão |
| `pt-PT.json` | Portuguese (Portugal) | O montante deve ser superior a zero / Saldo de stXCN insuficiente para esta operação / Saldo do contrato insuficiente — tente um montante inferior / Transferência falhada / Não foi possível estimar o gás — transação enviada com limite de gás predefinido |
| `ro.json` | Romanian | Suma trebuie să fie mai mare decât zero / Sold stXCN insuficient pentru această operațiune / Soldul contractului este insuficient — încercați o sumă mai mică / Transfer eșuat / Nu s-a putut estima gazul — tranzacția a fost trimisă cu limita de gaz implicită |
| `tr.json` | Turkish | Miktar sıfırdan büyük olmalıdır / Bu işlem için stXCN bakiyesi yetersiz / Sözleşme bakiyesi yetersiz — daha küçük bir miktar deneyin / Transfer başarısız oldu / Gaz tahmini yapılamadı — işlem varsayılan gaz limiti ile gönderildi |
| `vi.json` | Vietnamese | Số lượng phải lớn hơn 0 / Số dư stXCN không đủ cho thao tác này / Số dư hợp đồng không đủ — vui lòng thử số lượng nhỏ hơn / Chuyển khoản thất bại / Không thể ước tính gas — giao dịch đã được gửi với giới hạn gas mặc định |
| `zh-CN.json` | Chinese (Simplified) | 金额必须大于零 / 此操作的 stXCN 余额不足 / 合约余额不足 — 请尝试更小的金额 / 转账失败 / 无法估算 Gas — 交易已使用默认 Gas 限制发送 |
| `zh-TW.json` | Chinese (Traditional) | 金額必須大於零 / 此操作的 stXCN 餘額不足 / 合約餘額不足 — 請嘗試更小的金額 / 轉帳失敗 / 無法估算 Gas — 交易已使用預設 Gas 限制發送 |

**Implementation steps:**

1. Add the 5 keys to `en.json` first (after the existing `yield.yourStXCNBalance` key block for logical grouping)
2. Add matching translations to all 21 other locale files, each in the same position within the yield key block
3. Run the key parity test to verify: `CI=true npm test -- --testPathPattern keyParity`
4. Verify no JSON parse errors in any file

**Important notes:**
- Keep `stXCN` untranslated in all locales (it's a token symbol)
- Keep `gas` / `Gas` as-is in CJK locales (industry standard term)
- Arabic and Hebrew are RTL — the project already handles RTL via DirectionContext; no special formatting needed in the JSON values
- Use em dash (—) consistently for the "try a smaller amount" suffix, matching existing patterns in en.json

## Blockers
- `task-002-decode-custom-errors.md` — the i18n keys must match what the error decoder maps to. If task-002 changes the key names, this task's keys must match.

## Acceptance Checklist
- [ ] All 5 new keys present in `en.json`
- [ ] All 5 new keys present in `ru.json` with correct Russian translations
- [ ] All 5 new keys present in all 22 locale files (no missing keys)
- [ ] `keyParity.test.ts` passes (no missing keys in any locale)
- [ ] JSON is valid in all 22 files (no parse errors)
- [ ] Token symbol `stXCN` is preserved untranslated in all locales
- [ ] No existing keys are modified or removed
- [ ] `npm test` passes with no regressions
