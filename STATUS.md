# Stand am 26. November 2026

## Vorhanden und überprüft

- Projektname smairys.inventar, Backend Supabase Free und Zieladresse https://inventar.smairys.de sind durch den Nutzer festgelegt. DNS-Verwaltung erfolgt über Cloudflare.
- GitHub-Repository ist https://github.com/crycodebaby/smairys.inventar. Der Nutzer hat es öffentlich angelegt. Das lokale Git-Repository verwendet main und diese Adresse als origin. Originaldateien und der lokale SQLite-Bestand werden durch die projektbezogene .gitignore ausgenommen.

- Fünf flache Themenordner und 18 JPEG-Originaldateien in Tubes.
- inventar.sqlite mit Dateipfaden, SHA-256-Werten, Kategorien, editierbaren Zustandsvorschlägen, Sammlung Tubes, Lothar und einer offenen Arbeitsnotiz zum erwähnten BTB-Beleg.
- schema.sql als SQLite-Startschema. Zuletzt geprüft wurden Integrität, Fremdschlüssel und die Übereinstimmung der 18 Dateien mit ihrem Index.
- PROJEKT.md beschreibt Produktziel und Abläufe. docs enthält Architekturprüfung, Datenvertrag, Abnahmekriterien und Quellen.

## Offen

- Web-App, Anmeldung, Hosting, Cloud-Datenbank, Uploads, Datenabgleich und Offlinebetrieb müssen umgesetzt und getestet werden.
- Supabase Free ist festgelegt. Die Auswahl eines zusätzlichen Offline-Abgleichs sowie Fotovolumen und Gerätetests stehen aus.
- Ein Supabase-Projekt wurde für diese Sammlung noch nicht eingerichtet. Die Prüfung dieser Unterhaltung verwendet öffentlich zugängliche Dokumentation.
- Die vorhandene SQLite-Datei ist der lokale Anfangsbestand. Nach Migration in einen Cloud-Dienst wird ihre Rolle als Export oder Arbeitskopie ausdrücklich festgelegt.
- Der lokale Desktop-Zielordner liegt außerhalb der Schreibberechtigung dieser Sitzung. Die aktuellen Arbeitsdateien befinden sich im Projektordner innerhalb des freigegebenen Codex-Arbeitsbereichs.
- Transkriptionen, eindeutige Stückzuordnungen und Marktwerte sind noch zu erarbeiten.

## Nächste Arbeitseinheit

Ein technischer Durchstich bildet einen Gegenstand mit einer angehefteten Notiz, einer eigenen Kategorie und einem Foto ab. Er verbindet zwei Geräte und prüft Offline-Neustart, Uploadabbruch, Konfliktbehandlung und Wiederherstellung. Die Variantenbewertung und Abbruchkriterien stehen in docs/ARCHITEKTUR.md und docs/ABNAHME.md.

Status eines Tests wird als offen, bestanden oder fehlgeschlagen geführt. Eine Dokumentationsprüfung gilt als Quellenbeleg. Ein Gerätetest braucht ein protokolliertes Ergebnis auf dem benannten Gerät.
