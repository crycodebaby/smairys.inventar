# Stand am 26. November 2026

## Live eingerichtet und überprüft

- Vercel-Projekt smairys-inventar, ID prj_3FdWUXoXeRBzUcO8CDKO51U7mDYg, ist im Hobby-Team robin-schmeiries-projects mit GitHub main verbunden. Node.js 24.x, Vite, npm ci, npm run build und dist sind eingerichtet; die drei öffentlichen VITE-Konfigurationswerte sind hinterlegt.
- inventar.smairys.de ist dem Vercel-Projekt zugeordnet und als verified bestätigt. Vercel meldet für die vorhandene DNS-Konfiguration misconfigured=false und keine Konflikte. Andere Domains und DNS-Einträge wurden nicht geändert.
- Das Git-Produktionsdeployment dpl_HXwVVAShSA9d4cvw78urWKi4hUkA für Commit 8e4c2d33914864dd559f2f14215b3709584daf3e wurde mit READY und inventar.smairys.de als Alias bestätigt. Der HTTPS-Abruf der Domain liefert HTTP 200, den Titel smairys.inventar und die konfigurierten Sicherheits- und noindex-Header. JavaScript und CSS liefern ebenfalls HTTP 200; der Browser-Build enthält den richtigen Supabase-Projektbezug und den öffentlichen Publishable Key. Lokaler Build und alle sieben Tests haben erneut bestanden. Eine gerenderte Browserprüfung war wegen der unterbrochenen lokalen Browseranbindung nicht möglich; Anmeldung und Gerätebedienung bleiben offen.

- Supabase-Projekt xywnhifzahwcmclrfsil ist aktiv. Die Migrationen 20261125234917 und 20261125235513 sind angewendet.
- Die Edge Function inventory stellt HTTP-Befehle und einen OAuth-geschützten MCP-Adapter bereit. Sie prüft Benutzeranmeldung, für MCP zusätzlich Client-ID und Ressourcen-Audience.
- Sieben Befehle unterstützen Suche, Detailabruf, Bezeichnungen auflisten, Gegenstand erfassen, revisionsgeschützt ändern, Notiz anheften und eigene Bezeichnung erstellen.
- Schreibaufträge werden atomar protokolliert und bei gleicher operation_id wiedererkannt. Normale Benutzer haben eigentümerbezogene Leserechte, Änderungen laufen durch die begrenzte Befehlsschnittstelle.
- PostgreSQL-Tests für Idempotenz, Revisionen, Notizen und Kontotrennung haben bestanden. Testdaten wurden zurückgerollt. Der Security Advisor lieferte bei der ersten Einrichtung keine Hinweise.
- Live geprüft sind HTTP 200 für Status und Ressourcenmetadaten sowie HTTP 401 mit OAuth-Anforderung für anonymen MCP-Zugriff.

## Lokal implementiert und überprüft

- Die Textwarteschlange speichert abgeschickte Formulare in IndexedDB pro Konto und synchronisiert sie im Vordergrund. Auftrags-ID, Backoff und abgewiesene Eingaben bleiben beim Neustart erhalten. Das Zahnrad öffnet Konto, Synchronisierung und App-Updates.
- Die versionierte Offline-App-Hülle und ein begrenzter kontogetrennter Lesebestand sind implementiert. Die Zustandsübergänge für Start, Speichern, Fehler und Update werden explizit abgebildet. Der isolierte Browsertest prüft Neustart offline, Kontowechsel, abgelaufene Sitzung, Serverausfall, Wiederverbindung, Abmeldung und Update-Integrität. Echte Apple-Geräte, ausgewählte Offline-Fotos und vollständiger Bestand bleiben offen. Details stehen in docs/OFFLINE-UND-LAST.md.
- PostgreSQL meldete beim Start der Objektsuche SQLSTATE 42702, weil der Alias found mit einer PL/pgSQL-Variablen kollidierte. Die Migration 20261126015725 behebt die Startabfrage und begrenzt die Argumentgröße. Leerbestand, Treffer, Paginierung und Kontotrennung wurden live mit zurückgerollten Testdaten geprüft. Die Oberfläche unterscheidet Ladefehler von abgewiesenen Änderungen. Migration 20261126015611 ergänzt den vom Performance Advisor empfohlenen Index auf der Kategoriezuordnung.

- Die Arbeitsoberfläche wurde von Slogans, Einleitung und Fußzeile befreit. Objekt und Notizen stehen in getrennten Touch-Reitern; Konto, Kategorieanlage und selektiver Download liegen hinter bedarfsgesteuerten Menüs. Glass-Flächen haben dezente spektrale Kanten und respektieren reduzierte Transparenz. Die echte Darstellung auf iPhone/iPad ist weiterhin offen.
- TanStack Query 5.108.4 hält kontogetrennte Online-Caches. Bestätigte Änderungen aktualisieren gezielt die betroffenen Daten; laufende ältere Abfragen werden abgebrochen. Frische Objektdetails werden beim erneuten Öffnen wiederverwendet. Hintergrundaktualisierungen erhalten ungespeicherte Formularentwürfe. Die lokale Lesekopie ergänzt den Arbeitsspeicher. Geräteübergreifende Änderungen werden bei Fokus und Wiederverbindung abgerufen.
- Im Objektmenü kann zwischen Metadaten, Notizen und vorhandenen Links aus Notizen für Text-/JSON-Downloads gewählt werden. HTTP-Links in Notizen sind direkt anklickbar. Originalbilder, Versionen und ZIP-Export setzen die noch zu implementierende Medienablage voraus.

- React-/TypeScript-Web-App mit E-Mail-Anmeldung, Suche mit Seitennavigation, Erfassung/Bearbeitung von Gegenständen, neuen Kategorien mit Farbwahl und bei Erfassung wählbarer Kategorie. Notizen können als Abschrift mit getrennter Interpretation, Zuschreibung und Anheften erfasst werden. Die Mobilansicht wechselt zwischen Liste und Detailbereich.
- Die Formularoberfläche zeigt Revisionskonflikte und erhält den eigenen Entwurf. Bei bewusster Übernahme eigener Änderungen bleiben andere Serveränderungen erhalten. Bei unklarer Serverbestätigung wird im geöffneten Formular derselbe Auftrag erneut geprüft. Formularentwürfe bleiben im offenen Editor. Erst ein bestätigter lokaler Speichervorgang erzeugt einen dauerhaften Auftrag.
- Die Anmelderückkehr verwendet im veröffentlichten Build die konfigurierte Live-Adresse und erhält nur authorization_id für OAuth. Fehlerfragmente wie otp_expired werden verständlich angezeigt und aus der Adresszeile entfernt, ohne erfolgreiche Tokenrückgaben zu löschen. Ein neuer Anmeldelink kann angefordert werden.
- Optionale WebMCP-Seitenwerkzeuge verwenden dieselben Befehlsschemas und die aktuelle Anmeldung. Der Aufruf durch ChatGPT ist noch zu prüfen.
- Pluginvorlage mit OAuth-MCP-Konfiguration unter plugin.
- Typprüfung, Produktionsbuild und 23 automatisierte Tests haben bestanden. Hinzugekommen sind gezielte Cache-Invalidierung mit Kontotrennung, Abbruch älterer Abfragen, Wiederverwendung frischer Objektdetails in der echten React-Ansicht, Formularerhalt bei Reiterwechsel/Hintergrundaktualisierung und selektive Exporte. Die UI-Prüfungen verwenden ein simuliertes DOM und ersetzen keine echte Apple-Geräteprüfung. Der Supabase Security Advisor lieferte bei der letzten Prüfung keine Hinweise. Alle Paketversionen sind im Lockfile festgehalten.

## Projekt und Anfangsbestand

- Projektname smairys.inventar, Backend Supabase Free und Zieladresse https://inventar.smairys.de sind durch den Nutzer festgelegt. DNS-Verwaltung erfolgt über Cloudflare.
- GitHub-Repository ist https://github.com/crycodebaby/smairys.inventar. Der Nutzer hat es öffentlich angelegt. Das lokale Git-Repository verwendet main und diese Adresse als origin. Originaldateien und der lokale SQLite-Bestand werden durch die projektbezogene .gitignore ausgenommen.

- Fünf flache Themenordner und 18 JPEG-Originaldateien in Tubes.
- inventar.sqlite mit Dateipfaden, SHA-256-Werten, Kategorien, editierbaren Zustandsvorschlägen, Sammlung Tubes, Lothar und einer offenen Arbeitsnotiz zum erwähnten BTB-Beleg.
- schema.sql als SQLite-Startschema. Zuletzt geprüft wurden Integrität, Fremdschlüssel und die Übereinstimmung der 18 Dateien mit ihrem Index.
- PROJEKT.md beschreibt Produktziel und Abläufe. docs enthält Architekturprüfung, Datenvertrag, Abnahmekriterien und Quellen.

## Offen

- Echte Anmeldung auf der Live-Domain, Safari- und Homescreen-Abnahme auf Apple-Geräten, kompletter OAuth-Durchlauf, persönliche Installation in ChatGPT sowie Foto-Uploads und Offline-Dateien stehen aus.
- Der Nutzer meldete eine zugestellte Anmelde-E-Mail, deren Link zu localhost:3000 mit otp_expired führte. Er hat anschließend Site URL https://inventar.smairys.de und Redirect-Freigabe https://inventar.smairys.de/** im Dashboard gespeichert. Ein vollständiger Login mit einem danach frisch angeforderten, einmalig verwendeten Link ist weiterhin nachzuweisen. Die Supabase-Anbindung stellt keine Änderung der Auth-Konfiguration bereit; die lokale Browseranbindung ist derzeit nicht erreichbar.
- Die neue Rückkehrkonfiguration wurde anschließend ohne echte Zugangstokens geprüft: Zwei absichtlich ungültige Verifikationsaufrufe lieferten HTTP 303 zur Live-Domain, einmal über die Site URL und einmal mit erhaltener authorization_id. otp_expired ist bei diesen synthetischen Diagnoseaufrufen das erwartete Ergebnis und kein gescheiterter echter Benutzerlogin.
- Supabase Free ist festgelegt. Die Auswahl eines zusätzlichen Offline-Abgleichs sowie Fotovolumen und Gerätetests stehen aus.
- Der Supabase-OAuth-Server meldete bei der letzten öffentlichen Prüfung feature_disabled. Die vorhandene Token-Hook-Funktion muss in den Auth-Einstellungen ausgewählt werden.
- Der Nutzer hat das bestehende Projekt bestätigt. Auch der neu verbundene Supabase-Zugang hat Zugriff auf das Projekt. Die letzte Chrome-Prüfung wurde durch Escape abgebrochen; ein weiterhin fehlender Dashboardzugriff ist deshalb nicht bestätigt.
- Die vorhandene SQLite-Datei ist der lokale Anfangsbestand. Nach Migration in einen Cloud-Dienst wird ihre Rolle als Export oder Arbeitskopie ausdrücklich festgelegt.
- Der lokale Desktop-Zielordner liegt außerhalb der Schreibberechtigung dieser Sitzung. Die aktuellen Arbeitsdateien befinden sich im Projektordner innerhalb des freigegebenen Codex-Arbeitsbereichs.
- Transkriptionen, eindeutige Stückzuordnungen und Marktwerte sind noch zu erarbeiten.

## Nächste Arbeitseinheit

Die veröffentlichte Web-App mit einem neuen Link anmelden; die korrigierte Rückkehr zur Live-Domain ist diagnostisch bestätigt. Einen Gegenstand mit Kategorie und Notiz auf zwei Geräten erfassen/zurücklesen. Anschließend private Fotos und Belege integrieren; OAuth kann parallel freigeschaltet und getestet werden. Den Offline-Start und die lokale Warteschlange auf iPhone und iPad abnehmen. Die Reihenfolge und Erfolgskriterien stehen in docs/ROADMAP.md.

Der Nutzer hat den Produktkern konkretisiert: mehrere Fotos pro Objekt, Upload-Verlauf mit Benutzer/Zeit, eigene Bildanmerkungen, belegte KI-Merkmale, schnell erfassbare Quellen und Vergleichsverkäufe, unveränderte Originale mit OCR-/PDF-/Zeichnungsableitungen sowie selektive Downloads. Zielmodell, Grenzen und Abnahmereihenfolge stehen in docs/MEDIEN-UND-WISSEN.md. Diese Medien- und Wissensfunktionen sind noch nicht als Datenbank/Storage umgesetzt.

Status eines Tests wird als offen, bestanden oder fehlgeschlagen geführt. Eine Dokumentationsprüfung gilt als Quellenbeleg. Ein Gerätetest braucht ein protokolliertes Ergebnis auf dem benannten Gerät.
