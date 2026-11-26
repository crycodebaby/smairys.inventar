# Stand am 26. November 2026

## Live eingerichtet und überprüft

- Vercel-Projekt smairys-inventar, ID prj_3FdWUXoXeRBzUcO8CDKO51U7mDYg, ist im Hobby-Team robin-schmeiries-projects mit GitHub main verbunden. Node.js 24.x, Vite, npm ci, npm run build und dist sind eingerichtet; die drei öffentlichen VITE-Konfigurationswerte sind hinterlegt.
- inventar.smairys.de ist dem Vercel-Projekt zugeordnet und als verified bestätigt. Vercel meldet für die vorhandene DNS-Konfiguration misconfigured=false und keine Konflikte. Der abschließende HTTPS- und Oberflächentest nach dem konfigurierten Build steht noch aus. Andere Domains und DNS-Einträge wurden nicht geändert.

- Supabase-Projekt xywnhifzahwcmclrfsil ist aktiv. Die Migrationen 20261125234917 und 20261125235513 sind angewendet.
- Die Edge Function inventory stellt HTTP-Befehle und einen OAuth-geschützten MCP-Adapter bereit. Sie prüft Benutzeranmeldung, für MCP zusätzlich Client-ID und Ressourcen-Audience.
- Sieben Befehle unterstützen Suche, Detailabruf, Bezeichnungen auflisten, Gegenstand erfassen, revisionsgeschützt ändern, Notiz anheften und eigene Bezeichnung erstellen.
- Schreibaufträge werden atomar protokolliert und bei gleicher operation_id wiedererkannt. Normale Benutzer haben eigentümerbezogene Leserechte, Änderungen laufen durch die begrenzte Befehlsschnittstelle.
- PostgreSQL-Tests für Idempotenz, Revisionen, Notizen und Kontotrennung haben bestanden. Testdaten wurden zurückgerollt. Der Security Advisor lieferte bei der ersten Einrichtung keine Hinweise.
- Live geprüft sind HTTP 200 für Status und Ressourcenmetadaten sowie HTTP 401 mit OAuth-Anforderung für anonymen MCP-Zugriff.

## Lokal implementiert und überprüft

- React-/TypeScript-Web-App mit E-Mail-Anmeldung, Inventarliste und OAuth-Zustimmungsansicht im Liquid-Glass-Stil.
- Optionale WebMCP-Seitenwerkzeuge verwenden dieselben Befehlsschemas und die aktuelle Anmeldung. Der Aufruf durch ChatGPT ist noch zu prüfen.
- Pluginvorlage mit OAuth-MCP-Konfiguration unter plugin.
- npm run build und sieben automatisierte Tests haben bestanden. Darunter sind Tests mit signierten und gefälschten Testtokens und der zusätzlichen MCP-Audience.

## Projekt und Anfangsbestand

- Projektname smairys.inventar, Backend Supabase Free und Zieladresse https://inventar.smairys.de sind durch den Nutzer festgelegt. DNS-Verwaltung erfolgt über Cloudflare.
- GitHub-Repository ist https://github.com/crycodebaby/smairys.inventar. Der Nutzer hat es öffentlich angelegt. Das lokale Git-Repository verwendet main und diese Adresse als origin. Originaldateien und der lokale SQLite-Bestand werden durch die projektbezogene .gitignore ausgenommen.

- Fünf flache Themenordner und 18 JPEG-Originaldateien in Tubes.
- inventar.sqlite mit Dateipfaden, SHA-256-Werten, Kategorien, editierbaren Zustandsvorschlägen, Sammlung Tubes, Lothar und einer offenen Arbeitsnotiz zum erwähnten BTB-Beleg.
- schema.sql als SQLite-Startschema. Zuletzt geprüft wurden Integrität, Fremdschlüssel und die Übereinstimmung der 18 Dateien mit ihrem Index.
- PROJEKT.md beschreibt Produktziel und Abläufe. docs enthält Architekturprüfung, Datenvertrag, Abnahmekriterien und Quellen.

## Offen

- Abschließende Hosting-Abnahme nach dem konfigurierten Build, kompletter OAuth-Durchlauf, persönliche Installation in ChatGPT, Foto-Uploads, Datenabgleich und Offlinebetrieb sind offen.
- Supabase Free ist festgelegt. Die Auswahl eines zusätzlichen Offline-Abgleichs sowie Fotovolumen und Gerätetests stehen aus.
- Der Supabase-OAuth-Server meldete bei der letzten öffentlichen Prüfung feature_disabled. Die vorhandene Token-Hook-Funktion muss in den Auth-Einstellungen ausgewählt werden.
- Der Nutzer hat das bestehende Projekt bestätigt. Das Browserkonto wird bei dessen direktem Aufruf zur Organisationsübersicht geleitet. Für Dashboard-Einstellungen ist der Projektzugriff dieses Kontos zu ergänzen. Der verbundene Supabase-Zugang dieser Sitzung hat Zugriff auf das bestehende Projekt.
- Die vorhandene SQLite-Datei ist der lokale Anfangsbestand. Nach Migration in einen Cloud-Dienst wird ihre Rolle als Export oder Arbeitskopie ausdrücklich festgelegt.
- Der lokale Desktop-Zielordner liegt außerhalb der Schreibberechtigung dieser Sitzung. Die aktuellen Arbeitsdateien befinden sich im Projektordner innerhalb des freigegebenen Codex-Arbeitsbereichs.
- Transkriptionen, eindeutige Stückzuordnungen und Marktwerte sind noch zu erarbeiten.

## Nächste Arbeitseinheit

Das konfigurierte GitHub-Deployment unter inventar.smairys.de abschließend prüfen. Danach OAuth-Server, Zustimmungsseite und Token Hook verbinden und die persönliche ChatGPT-Verbindung testen. Hosting-Werte stehen in docs/DEPLOYMENT.md, OAuth-Werte und Nachweise in docs/CHATGPT.md. Der spätere Offline-/Fotodurchstich bleibt in docs/ABNAHME.md beschrieben.

Status eines Tests wird als offen, bestanden oder fehlgeschlagen geführt. Eine Dokumentationsprüfung gilt als Quellenbeleg. Ein Gerätetest braucht ein protokolliertes Ergebnis auf dem benannten Gerät.
