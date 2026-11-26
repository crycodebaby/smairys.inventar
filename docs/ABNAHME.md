# Nachweise für den technischen Durchstich

Stand 26. November 2026. Die folgenden Geräte- und End-to-End-Tests sind offen. Automatisierte Vorprüfungen für Eingaben, Authentifizierung, MCP, Idempotenz und Kontotrennung haben bestanden. Ihre Grenzen stehen in CHATGPT.md und ../STATUS.md.

Für jeden Durchlauf werden App-Version, Abhängigkeiten aus dem Lockfile, Gerät, Betriebssystem, Browser beziehungsweise Homescreen-App, Datum, Schritte, Ergebnis und relevante anonymisierte Logs erfasst. Die Testdaten bilden einen Gegenstand, eine Notiz und ein Foto ab. Die vorhandenen 18 Fotos liefern zusätzlich einen kleinen Importbestand. Grenzfälle brauchen weitere geeignete Testdateien.

| ID | Versuch | Erfolgskriterium |
| --- | --- | --- |
| T01 | Derselbe Zugang auf iPhone, iPad und PC | Gegenstand, Notiz und bestätigtes Foto erscheinen auf allen Geräten |
| T02 | In iPhone-Safari und als Homescreen-App öffnen, vorbereiten, Flugmodus einschalten, App vollständig beenden und neu öffnen | Datensätze und als offline verfügbar markierte Fotos bleiben nutzbar |
| T03 | Offline zwei aufeinanderfolgende Änderungen und eine neue Notiz speichern, App beenden, neu öffnen, verbinden | Änderungen kommen vollständig und mit nachvollziehbarer Reihenfolge auf dem zweiten Gerät an |
| T04 | Beide Geräte ändern offline dieselbe Notiz unterschiedlich | Beide Fassungen bleiben bis zur bewussten Konfliktauflösung erhalten |
| T05 | Dieselbe Übertragung wiederholen und eine Antwort nach Serverannahme verlieren lassen | Ein fachlicher Auftrag wird genau einmal wirksam, ein Foto bekommt einen bestätigten Originalbezug |
| T06 | Kleines JPEG, tatsächlich geliefertes HEIC und große Aufnahme über 10 MiB wählen | Originalprüfung, lesbare Vorschau, korrekte Orientierung und beherrschbarer Speicherverbrauch |
| T07 | Foto offline hinzufügen, App schließen und erneut öffnen | Datei und Zuordnung sind tatsächlich persistent. Ein lokaler Speicherfehler wird sichtbar gemeldet |
| T08 | Während des Uploads Verbindung abbrechen, Bildschirm sperren, App beenden und später erneut öffnen | Vorgang kann fortgesetzt oder idempotent wiederholt werden. Status zeigt das tatsächliche Ergebnis |
| T09 | Künstlich wenig Gerätespeicher sowie verweigerte Persistenz prüfen | Begrenzung ist sichtbar, ausstehende Daten werden erhalten oder der Speichervorgang schlägt eindeutig fehl |
| T10 | Kategorie und Farbe offline erstellen und umbenennen. Auf anderem Gerät verwendete Kategorie archivieren | Eindeutige IDs und erhaltene Beziehungen, Konflikte mit Archivierung sichtbar |
| T11 | Notiz löschen und wiederherstellen. Altes Gerät später verbinden | Löschzustand wird konsistent übertragen, Rückgängig bleibt im vorgesehenen Zeitraum möglich |
| T12 | Private Datei-URL ablaufen lassen und erneut online beziehungsweise offline öffnen | Online wird Zugriff erneuert, offline wird der lokal bestätigte Blob genutzt |
| T13 | Zweites Testkonto verwendet fremde Datensatz-ID und Datei-ID | Zugriff wird auf API-, Storage- und Sync-Ebene verweigert |
| T14 | Sitzung ablaufen lassen, offline arbeiten, online neu anmelden und Konto wechseln | Offene Arbeiten bleiben dem richtigen Konto zugeordnet und können sicher übertragen werden |
| T15 | Export erstellen, in einer leeren Testumgebung wiederherstellen | Beziehungen und 18 Originaldateien stimmen einschließlich SHA-256 überein |
| T16 | App- und Schema-Update mit offenen Offlineänderungen | Warteschlange und Originaldateien überstehen den Wechsel oder werden mit getesteter Migration übernommen |
| T17 | Mehrere Browserfenster und Homescreen-App gleichzeitig verwenden | Datenbanksperren führen zu behandelbaren Zuständen. Keine unbestätigte dauerhafte Speicherung im RAM |
| T18 | Liquid Glass auf echtem iPhone und iPad mit großen Texten und reduzierter Bewegung testen | Gut lesbare Handschriften, bedienbare Plus-/X-Aktionen, lesbare Formularfehler und flüssige Bildnavigation |

## Entscheidungsfolgen

Eine Variante mit Verlust lokal bestätigter Änderungen oder Fotos fällt bis zur Behebung aus. Ein überschrittenes Budget führt zur Prüfung der günstigeren Variante. Ein nicht erfüllbarer Hintergrundupload bei geschlossenem iPhone führt zur erneuten Prüfung einer nativen Ergänzung, sofern dieser Ablauf zur Pflicht erklärt wird.

Playwright unterstützt automatische Browser- und Offlineprüfungen. Apple-Geräte ergänzen diese Prüfung für Kamera, App-Beendigung, Speicherdruck und Homescreen-Verhalten. Ausgewählte Testfälle werden bei Änderungen an Authentifizierung, Synchronisation, Service Worker oder Dateitransport erneut ausgeführt.
