# smairys.inventar

Inventar, Dokumentation und Recherche zum musikalischen Nachlass von Lothar. Geplant ist eine minimalistische Web-App mit Liquid-Glass-Oberfläche für iPhone, iPad, Laptop und PC.

## Festgelegte Vorgaben

- Projekt und GitHub-Repository heißen `smairys.inventar`.
- Zieladresse ist `https://inventar.smairys.de`.
- DNS wird vom Eigentümer über Cloudflare eingerichtet.
- Datenbank, Anmeldung und Dateispeicher werden mit Supabase Free umgesetzt.
- Die Anwendung unterstützt individuell bearbeitbare Kategorien, Zustände, Markierungen und angeheftete Notizen.
- Offlinebetrieb und Geräteabgleich gehören zum Zielumfang.

## Projektstand

Das Repository enthält die Projektgrundlage, das SQLite-Startschema und die technischen Verträge. App-Code, Hosting und Cloud-Anbindung folgen in der Umsetzung. Der aktuelle Stand steht in [STATUS.md](STATUS.md).

## Dokumentation

| Datei | Inhalt |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Einstieg für KI-Agenten |
| [PROJEKT.md](PROJEKT.md) | Produktanforderungen und Arbeitsabläufe |
| [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md) | Architekturentscheidungen und Gegenprüfung |
| [docs/DATENVERTRAG.md](docs/DATENVERTRAG.md) | Datenintegrität, Uploads und Synchronisation |
| [docs/ABNAHME.md](docs/ABNAHME.md) | Praktische Abnahmetests |
| [docs/QUELLEN.md](docs/QUELLEN.md) | Technische Primärquellen |
| [schema.sql](schema.sql) | Schema des lokalen Startkatalogs |

## Lokale Bestandsdaten

Die Themenordner, Originalfotos und `inventar.sqlite` bilden den lokalen Bestand. Git verwaltet die Projektdateien. Die Git-Ignore-Regeln berücksichtigen die derzeitigen Bestandsordner, Sicherungen und Zugangsdaten. Bei neuen Bestandsordnern werden diese Regeln entsprechend ergänzt. Das spätere private Supabase Storage und der vollständige Export übernehmen die Dateiablage der App.

## Konfiguration und Betrieb

`.env.example` enthält die vorgesehenen Variablen als Vorlage. Nach Einrichtung des Supabase-Free-Projekts wird daraus eine lokale `.env.local`. Die Anwendung erhält einen browsergeeigneten Publishable Key. Privilegierte Datenbank- und Serviceschlüssel gehören in die Serverumgebung.

Die Auswahl des Offline-Abgleichs steht aus. Die Entscheidung für Supabase Free umfasst noch keine Auswahl eines zusätzlichen Synchronisationsdienstes.

Der Cloudflare-DNS-Eintrag braucht den konkreten Zielwert des später gewählten Hostings. Dieser Wert wird beim Hosting-Setup dokumentiert. Build- und Startbefehle werden mit dem ausführbaren App-Gerüst in `package.json` angelegt.
