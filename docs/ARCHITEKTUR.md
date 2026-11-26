# Architekturprüfung

Stand 26. November 2026. Die Online-Basis ist implementiert; Offline- und Fototransportvarianten sind weiterhin Vorschläge. Produktziele stehen in ../PROJEKT.md, Ausführung und offene Punkte in ../STATUS.md. Quellenkennungen verweisen auf QUELLEN.md.

## Implementierte Online-Basis

React/TypeScript mit Vite, Supabase Free und Vercel sind eingerichtet. Versionierte PostgreSQL-Migrationen definieren die Eigentümergrenzen und begrenzten Inventarbefehle. Schreibaufträge tragen eine operation_id; Updates prüfen die gelesene Revision. Der Browser verwendet dieselben Befehle wie MCP. Der angemeldete Inventarbereich wird bei Bedarf geladen und bei Kontowechsel neu aufgebaut; die Zugriffstokens bleiben an das zugehörige Konto gebunden.

Die erste Formularoberfläche hält bei Konflikten Eingabe und Serverfassung getrennt. Eine bewusste Übernahme der eigenen Änderungen erhält andere, unveränderte Felder aus der aktuellen Serverfassung. Ein unbestätigter Auftrag wird nur mit ursprünglicher UUID und Nutzlast wiederholt. Die hierfür gehaltene Warteschlange ist noch nicht persistent. Das ist ein vorbereiteter Online-Vertrag und kein Nachweis für Offline-Synchronisation.

Vitest ist derzeit nicht erforderlich: Node test prüft Fachlogik und HTTP/MCP, React Testing Library mit jsdom prüft zwei kritische Formularabläufe. Vite transformiert TSX auch für diese Tests. Echte Browser-, Authentifizierungs- und Apple-Gerätetests bleiben zusätzlich nötig.

## Verbindliche Nutzerentscheidung

Projektname ist smairys.inventar. Backend ist Supabase Free. Zieladresse ist https://inventar.smairys.de mit DNS bei Cloudflare. Diese Festlegung ersetzt die offene Auswahl des zentralen Backends. Die folgende Variantenprüfung dokumentiert die bisherige Abwägung. Ein zusätzlicher Synchronisationsdienst bleibt auszuwählen. Hosting und DNS-Zielwert werden bei der Bereitstellung konkretisiert.

## Entscheidung A1 – Eine geräteübergreifende PWA

Die Web-App bekommt eine feste HTTPS-Adresse und eine Anmeldung für denselben Eigentümer auf allen Geräten. Die App soll sich auf dem Homescreen ablegen lassen. Für den zentralen Bestand wird ein erreichbarer Backend-Dienst benötigt. Bei Auswahl von Supabase genügt zunächst ein Projekt für alle Geräte.

Eine Progressive Web App mit lokalem Datenbestand passt zum gewünschten Browserzugriff. Offlinezugriff setzt voraus, dass Oberfläche und benötigte Daten auf dem jeweiligen Gerät vorhanden sind. Betriebssystemversionen der tatsächlichen iPhones und iPads müssen vor Abnahme erfasst werden.

Diese Empfehlung wird neu bewertet, falls zuverlässige lange Uploads bei gesperrtem Telefon oder direkter kontinuierlicher Zugriff auf lokale Ordner zur Pflicht werden. Dann muss zusätzlich eine native App oder eine Desktop-Komponente geprüft werden. Das Anforderungsziel bleibt geräteübergreifende Bedienung.

## Entscheidung A2 – Datenhaltung und Synchronisation

| Variante | Arbeitserleichterung | Preis und Gegenargument | Bewertung |
| --- | --- | --- | --- |
| Supabase mit PowerSync | PostgreSQL, Anmeldung, Dateispeicher und reaktives lokales SQLite mit verwalteter Synchronisation | Zwei Dienste, zusätzliche Rechtekonfiguration, eigener Schreibendpunkt und Konfliktregeln. Pro-Tarife beginnen gemeinsam bei 74 USD monatlich, Hosting und Mehrverbrauch kommen gegebenenfalls hinzu | Technischer Favorit für ein relationales Archiv bei passendem Budget und bestandener Geräteprüfung |
| Dexie Cloud | IndexedDB-basierte Offline-Daten, integrierte Anmeldung und Synchronisation | Eigenes Daten- und Berechtigungsmodell. Neue Blob-Auslagerung laut Dokumentation Canary. Export und Fototransport brauchen einen praktischen Nachweis | Ernsthafte Alternative für kleines Budget, besonders bei einem Eigentümer |
| Eigener SQLite-API-Server | Bestehende Datenbank und Dateistruktur gut nutzbar, ein zentraler Dienst | Serverbetrieb, Anmeldung, Dateizugriff, Offlineprotokoll und Wiederherstellung selbst integrieren | Gut bei vorhandener Betriebsinfrastruktur und Wartungsbereitschaft |
| Supabase mit Dexie und eigenem Abgleich | PostgreSQL zentral und IndexedDB lokal | Eigene Behandlung von Reihenfolge, Duplikaten, Löschungen, Authentifizierung, Schemawechseln und Konflikten | Reserveoption bei belegtem Kostenvorteil und bewusst eng begrenztem Schreibmodell |

Die Bewertung gewichtet Datenintegrität, Wartungsaufwand und SQL-Nutzbarkeit. Supabase Free wurde anschließend vom Nutzer ausgewählt. Das gemessene Fotovolumen und die Wahl des zusätzlichen Datenabgleichs stehen aus. Quellen S1, S2, S3, S4, S5, S6, S7 und S8.

Der PowerSync-Web-SDK und seine React-Hooks sind als GA dokumentiert. Bei Dateianhängen werden Alpha-Helfer geführt. Diese Reifegrade müssen getrennt beurteilt werden. Die einfache Backend-Variante verwendet feldweises Last-Write-Wins. Die gewünschte Sichtbarkeit von Konflikten braucht eine bewusst implementierte Schreibregel. Quellen S3, S4 und S5.

Für den ersten Durchstich wird Supabase Free verwendet. Der Datenabgleich wird anhand der dokumentierten Anforderungen ausgewählt. Dateien erhalten einen gesonderten, persistenten Uploadpfad. PowerSync bleibt ein Kandidat, dessen zusätzliche Dienstkosten und Gratisgrenzen separat zu prüfen sind.

## Entscheidung A3 – Bibliotheken

| Aufgabe | Bevorzugtes Werkzeug | Nutzen und verbleibende Arbeit |
| --- | --- | --- |
| Oberfläche und Build | React, TypeScript und Vite | Komponenten, Typprüfung und statischer Build. Responsive Abläufe werden im Projekt gestaltet |
| App-Hülle offline | vite-plugin-pwa mit Workbox | Manifest und Service Worker. Updateverhalten und Offlineabdeckung müssen getestet werden |
| Zugriff auf Supabase | @supabase/supabase-js | Anmeldung, Daten- und Storage-API. Zugriffsregeln bleiben Teil des Projekts |
| Lokale SQL-Daten und Datenabgleich | @powersync/web und @powersync/react | Lokale Datenbank, Warteschlange und reaktive Abfragen. Schreibregeln und Berechtigungen werden integriert |
| Fotoübertragung | Uppy Core mit Tus oder direkt tus-js-client | Wiederaufnehmbare Transfers. Eine persistente lokale Datei und ein Übertragungszustand bleiben erforderlich |
| Galerie | PhotoSwipe | Touchbedienung und vergrößerte Bildansicht. Offline-Dateien und Bildgrößen liefert die App |
| Dialoge und Auswahlfelder | Gezielt Radix Primitives | Fokus- und Tastaturverhalten. Liquid Glass entsteht über eigene CSS-Variablen und wenige Komponenten |
| Formulare | React Hook Form mit Zod | Formularzustand und Eingabevalidierung. Serverseitige Prüfung gehört zusätzlich dazu |
| Regressionsprüfung | Playwright, ergänzend Vitest bei geeigneter Fachlogik | Browserabläufe, Offlineemulation und Konfliktfälle. Echte Apple-Geräte ergänzen automatisierte Tests |

Quellen S3, S9, S10, S11, S12, S13, S14 und S15. Der Stack ist eine begründete Auswahl. Pakete werden beim Implementieren des jeweiligen Ablaufs hinzugefügt und im Lockfile fixiert. Abhängigkeiten, die dieselbe Datenhaltung doppelt verwalten, brauchen einen konkreten Nutzen. Flüssige Glasflächen werden anhand von Lesbarkeit, Bildschärfe und Leistung auf dem iPad beurteilt.

## Widerlegungsversuche und Folgerungen

| Annahme | Gegenbeleg oder offene Frage | Konsequenz |
| --- | --- | --- |
| Eine zentrale Datenbank liefert vollständigen Offlinebetrieb | Gerätedaten, Dateien und Oberfläche brauchen lokale Speicherung | Daten- und Dateiabgleich separat nachweisen |
| Offline im Browser bedeutet dauerhaft aufbewahrt | WebKit dokumentiert Speicherquoten und mögliche Eviction | Persistenz anfragen, Speicherfehler behandeln, Export und zentrale Sicherung einrichten. Quelle S16 |
| Hochladen läuft nach Schließen der App sicher weiter | Background-Sync hat eingeschränkte Browserverfügbarkeit | Fortsetzung beim erneuten Öffnen nachweisen. Übertragungen im Vordergrund anzeigen. Quelle S17 |
| Ein fertiges Sync-SDK löst jede Kollision | PowerSync überlässt Konflikte dem Backend | Revisionsprüfung und unverlorene Konfliktfassungen bauen. Quelle S5 |
| Eine Foto-URL ist ein stabiler Offlinebezug | Private Download-URLs haben begrenzte Gültigkeit | Objekt-ID speichern, URL erneuern und heruntergeladene Blobs getrennt adressieren. Quelle S18 |
| Datenbankbackup sichert den Nachlass vollständig | Supabase-Backups enthalten Storage-Dateien lediglich als Metadaten | Datenbank und echte Dateien gemeinsam exportieren und wiederherstellen. Quelle S19 |
| Günstige Gratis-Tarife sind jederzeit erreichbar | Supabase und PowerSync nennen Inaktivitätspausen im Free-Tarif | Im Prototyp berücksichtigen und dauerhaften Betrieb separat kalkulieren. Quellen S1 und S2 |
| Fototransport kann unverändert aus Beispielen übernommen werden | PowerSync-Dateihelfer Alpha, Dexie-Blob-Offloading Canary | Genau verwendete Funktion und Version qualifizieren. Quellen S4 und S7 |
| Ein Konverter stellt jedes iPhone-Foto dar | HEIC/HEVC benötigt passende Decoder und Tests | Original und Vorschaubild getrennt aufbewahren, JPEG und tatsächlich geliefertes HEIC prüfen. Quelle S20 |

## Kleiner Durchstich vor vollständigem Ausbau

Es werden ein Gegenstand, eine Handschrift, eine neue Kategorie und echte Fotos auf zwei Geräten verwendet. Die Tests in ABNAHME.md liefern die Entscheidungsgrundlage. Solange diese Ergebnisse fehlen, sind Gerätekompatibilität und Wiederanlauf nach App-Abbruch offene Nachweise.

Erst nach diesem Nachweis folgen vollständige Inventaransichten, Recherche, Bewertung und Verkaufsablauf. Ein Bestandsimport übernimmt IDs und SHA-256-Werte. Die vorhandene SQLite-Datei wird dabei kontrolliert übernommen. Das PowerSync-Client-Schema wird aus dem gewählten Servermodell abgeleitet.

## Kostenmodell

Aktuell nennt Supabase Pro ab 25 USD und PowerSync Pro ab 49 USD pro Monat. Die Summe von 74 USD ist der Einstieg in diese beiden bezahlten Dienste. Hosting, Steuern, Datentransfer und Überschreitungen müssen für die konkrete Region und Nutzung geprüft werden. Free-Tarife sind für den technischen Durchstich möglich und haben Inaktivitätsregeln. Quellen S1 und S2.

Dexie listet 100 MB im Free-Tarif und ein Produktionspaket von 25 Plätzen zu zusammen 3 EUR monatlich. Die inkludierten Mengen werden für strukturierte Daten und Blobs getrennt ausgewiesen. Wegen des dokumentierten Canary-Status der Blob-Auslagerung wird daraus erst nach praktischer Prüfung ein Produktionsvorschlag. Quelle S6 und S7.

Als reine Rechenannahme ergeben 5.000 Originalfotos zu durchschnittlich 4 MB etwa 20 GB, zuzüglich Vorschaubildern und Sicherung. Datentransfer wächst mit Downloads auf die einzelnen Geräte. Die tatsächlichen hochgeladenen Dateiformate, Größen und Originalanforderungen entscheiden über die Kalkulation.

## Context Engineering

AGENTS.md ist ein kurzer Einstieg mit Aufgabenzuordnung. STATUS.md hält den überprüften Iststand fest. PROJEKT.md ist die Produktreferenz. Dieses Dokument erklärt Entscheidungen einschließlich Alternativen und Änderungskriterien. DATENVERTRAG.md hält technische Invarianten fest, ABNAHME.md die beobachtbaren Nachweise und QUELLEN.md die externen Belege.

Ein Agent lädt zuerst den kurzen Einstieg und den Iststand. Danach liest er nur die zur Aufgabe gehörenden Verträge, Quellcode-Dateien und Tests. Implementierte Verträge werden durch Migrationen, generierte Typen, Lockfile und Tests konkretisiert. Start- und Prüfbefehle werden aus package.json übernommen. Änderungen an diesen Befehlen werden mit dem Status aktualisiert. Quellen S21 und die projektspezifische Dokumentationsentscheidung.

Langfristige Produktentscheidungen bleiben von Arbeitsständen getrennt. Ein Arbeitseintrag nennt Ziel, betroffene Dateien, Nachweis und nächste offene Aufgabe. Historische Gesprächsverläufe dienen bei Bedarf als Herkunftsquelle. Das verhindert, dass ein alter Vorschlag versehentlich als implementierte Funktion behandelt wird.
