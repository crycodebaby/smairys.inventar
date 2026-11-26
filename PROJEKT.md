# Musik & Lothars Erbe

Der technische Projektname ist smairys.inventar. Festgelegt sind Supabase Free als Backend und https://inventar.smairys.de als Zieladresse. Die DNS-Verwaltung erfolgt über Cloudflare.

Stand 26. November 2026. Dieses Dokument beschreibt das Produktziel. Die SQLite-Datei ist ein erster lokaler Katalog. Die erste Web-Anmeldung und die Befehlsschicht sind implementiert. Den aktuellen Umsetzungsstand beschreibt STATUS.md.

## Zweck

Die Sammlung soll Gegenstände aus Lothars musikalischem Nachlass identifizierbar und wiederauffindbar machen. Sie soll Herkunft, Einsatz, Zustand und Verkaufsmöglichkeiten nachvollziehbar dokumentieren. Persönliche Erinnerungen, Beschriftungen und Belege gehören zum Bestand.

Laut Nutzer war Lothar sein Vater, lebenslang Musiker und sammelte seit den 1960er-Jahren Equipment. Der Nutzer nennt eine zeitweise bezahlte Tätigkeit in der „Ted schille Band“. Schreibweise, Zeitraum und weitere biografische Angaben brauchen bei Bedarf eigene Belege.

## Ablage

Die Themenordner liegen direkt nebeneinander. Aktuell bestehen Tubes, Gitarren, Roehrenverstaerker, Trafos und Musikboxen. Weitere Themen entstehen bei tatsächlichem Bedarf.

Fotos und thematisch zugehörige Dokumente liegen direkt im Themenordner. Datenbank, Schema und Projektkonzept liegen im Hauptordner. Eine stabile Inventarnummer ordnet den physischen Gegenstand zu, auch wenn sein Name sich nach einer Recherche ändert. Der Koffer „Tubes“ ist eine Sammlung mit einzelnen Gegenständen. Die Stückzahl ergibt sich aus der Erfassung der Inhalte.

Originaldateien behalten ihre Herkunft und bekommen einen SHA-256-Fingerabdruck. Spätere Ausschnitte oder lesbarer aufbereitete Bilder werden als eigene Dateien mit Verweis auf das Original erfasst. Datenbankpfade bleiben relativ zum Hauptordner, damit die Sammlung umziehen kann. Bei weiteren Importen werden Dateikollisionen und identische Inhalte geprüft.

## Was miteinander verknüpft wird

| Datensatz | Informationen und Beziehungen |
| --- | --- |
| Gegenstand | Inventarnummer, Kategorie, Sammlung, Lagerort, Aufdruck, vermuteter oder belegter Typ, Zustand, Prüfstatus und Bearbeitungsstand |
| Datei | Originalname, relativer Pfad, Fingerabdruck, Dateigröße, Herkunft und Bezug zum Gegenstand oder Dokument |
| Notiz oder Beleg | Originalabbildung, wortgetreue Abschrift, unleserliche Stellen, Zuschreibung zu Lothar, Datum und Interpretation |
| Quelle | Herstellerdatenblatt, Archiv, Verkaufsbeleg oder Nutzerangabe mit Fundstelle, Abrufdatum und optionaler lokaler Kopie |
| Rechercheaussage | Konkrete Behauptung, Belegquellen, Begründung und Sicherheit der Einordnung |
| Bewertung | Datierte Preisspanne, angenommener Zustand, Vergleichsverkäufe, Käufergruppen, Kaufmotive, Vorteile und Nachteile |
| Verkaufsvorgang | Plattform, Angebot, Reservierung, Verkauf, Zahlung, Versand, Rückgabe, Beträge und Kosten |
| Person | Name, Bezug zum Nachlass und Herkunft der biografischen Angaben |

Eine Notiz oder Rechnung kann mehrere Gegenstände betreffen. Ein Gegenstand kann mehrere Fotos, Notizen, Quellen und zeitlich aufeinanderfolgende Bewertungen haben. Eine Händlerrechnung kann später über ihre Positionen mit mehreren Gegenständen verbunden werden. Die konkrete Erfassung von Rechnungspositionen ergänzen wir mit dem ersten lesbaren Beleg.

## Umgang mit Lothars Beschriftungen

Bei Handschriften erfassen wir zuerst den sichtbaren Wortlaut. Unsichere Zeichen werden mit eckigen Klammern markiert, beispielsweise [unleserlich] oder [3?]. Die Interpretation bekommt ein eigenes Feld. Datum, Einheiten, Vorzeichen und Hinweise wie „alt“, „neu“, „brummarm“ oder „Marshall“ bleiben erhalten. Die Zuschreibung zur Handschrift wird dokumentiert.

Eine Schachtelbeschriftung ist ein Hinweis für die Identifikation des Inhalts. Zur Bestätigung gehören Fotos der tatsächlichen Röhre und ihrer Kennzeichnungen. Historische Messnotizen bekommen ihren eigenen zeitlichen und technischen Kontext. Prüfgerät, Messbedingungen, Einheit und heutiger Prüfstatus müssen nachvollziehbar werden.

Der vom Nutzer erwähnte Beleg von 1998 von „BTB Elektronik Vertriebs GmbH“ aus Nürnberg ist als noch zu erfassendes Dokument vorgemerkt. Foto, Datum, Positionen, Preise und Zuordnung sind offen.

## Ablauf bis zur Verkaufsentscheidung

1. Gegenstand mit Inventarnummer, Fundort und Fotos erfassen.
2. Aufdrucke und beiliegende Notizen zuordnen.
3. Typ und Zweck recherchieren, Quellen und offene Fragen speichern.
4. Zustand und gegebenenfalls fachkundige Prüfung dokumentieren.
5. Vergleichsverkäufe und unterschiedliche Zustandsannahmen auswerten.
6. Käufergruppen und deren Verwendungszweck beschreiben.
7. Entscheidung über Behalten, weitere Prüfung oder Verkauf festhalten.
8. Angebot vorbereiten, Plattform und Preis bestimmen, Verkauf bis Zahlung und Übergabe verfolgen.

Die App soll nach Typ, Marke, Kategorie, Fundort, Inventarnummer, Handschrift, Quelle und Bearbeitungsstand suchen können. Angebote werden vor Veröffentlichung geprüft. Ein abgeschlossener Verkauf bleibt mit seinen Belegen im Archiv nachvollziehbar.

## Individuelle Erweiterung und Oberfläche

Kategorien, Zustandsbezeichnungen, Arbeitsschritte und farbige Markierungen werden als bearbeitbare Datensätze geführt. Die anfänglichen Vorschläge lassen sich ergänzen, umbenennen, umfärben und entfernen. Die Kategorien bleiben flach. Mehrere Markierungen können gleichzeitig an einem Gegenstand oder einer Notiz hängen.

| Bedienung | Gewünschtes Verhalten |
| --- | --- |
| Textfeld und Plus | Neue Kategorie, Zustandsbezeichnung oder Markierung erstellen und unmittelbar auswählen |
| Name bearbeiten | Bezeichnung ändern, bestehende Zuordnungen über die stabile ID erhalten |
| Farbpunkt | Farbe einer Markierung auswählen und sofort anzeigen |
| X an einer Zuordnung | Markierung vom geöffneten Gegenstand oder von der Notiz lösen |
| Eintrag entfernen | Bei unbenutzten Einträgen entfernen. Bei verwendeten Einträgen Anzahl der Bezüge zeigen und Ersatz oder Archivierung ermöglichen |
| Notiz anheften | Notiz in der Detailansicht oben anzeigen |
| X an einer Notiz | Notiz in den Papierkorb legen, Rückgängig anbieten und Wiederherstellung ermöglichen |

Endgültiges Löschen bekommt eine eigene Aktion im Papierkorb. Historische Verkaufsdaten und Originaldateien werden bei einer entfernten Notiz über ihre eigenen Datensätze weiter verwaltet. Bei einer späteren Offline-Synchronisation werden Löschungen als Datensatzänderungen übertragen.

Die visuelle Richtung ist ein extrem minimalistisches, modernes Liquid-Glass-Interface. Die Inventarliste und die geöffnete Detailansicht stehen im Mittelpunkt. Transparente, weichgezeichnete Flächen, feine Lichtkanten und zurückhaltende Tiefe bilden den Rahmen. Text, Fotos und handschriftliche Quellen bleiben gut lesbar. Die App verwendet lokale Systemschriften und lädt ihre Grundfunktionen ohne externe Schrift- oder Grafikdienste.

Oben stehen Suche und „Erfassen“. Kategorien und Zustände erscheinen als kompakte Filter. Eine Detailansicht enthält Fotos, Identifikation, Zustand, angeheftete Notizen, Quellen, Bewertung und Verkaufsstand. Erweiterte Funktionen werden bei Bedarf eingeblendet. Auf dem Handy öffnet sich die Detailansicht als eigene Ansicht. Plus, X und Farbpunkte bekommen zugängliche Beschriftungen und sind mit Tastatur und Touch bedienbar. Reduzierte Transparenz und reduzierte Bewegung werden berücksichtigt.

Die konkrete Oberfläche ist noch zu implementieren. Die Datenstruktur enthält dafür bereits frei bearbeitbare Kategorien, Zustände, Arbeitsschritte, Markierungen, Zuordnungen und anheftbare Notizen.

## Technische Umsetzung und Architekturprüfung

Die Zielgeräte sind iPhone, iPad, Laptop und Desktop-PC. Ein gemeinsamer Zugang soll über eine feste HTTPS-Adresse den zentralen Bestand öffnen. Für Offlinebetrieb werden die Oberfläche, Datensätze und ausgewählte Fotos auf dem jeweiligen Gerät vorbereitet.

Die aktuelle Bewertung mit Alternativen, Kosten und Widerlegungsversuchen steht in [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md). Der technische Datenvertrag steht in [docs/DATENVERTRAG.md](docs/DATENVERTRAG.md), die praktischen Nachweise in [docs/ABNAHME.md](docs/ABNAHME.md) und die Primärquellen in [docs/QUELLEN.md](docs/QUELLEN.md).

Supabase Free ist als Backend festgelegt. Vorgeschlagen ist eine React-/TypeScript-PWA mit einer noch auszuwählenden Offline-Synchronisation. Fotoübertragung und Geräteabgleich werden in einem kleinen durchgängigen Prototyp überprüft.

Der lokale Ordner bleibt als Import- und Exportbestand mit Originalen und Prüfsummen vorgesehen. Der Onlinebestand liegt beim gewählten Backend. Automatische Übernahme von Dateien aus einem PC-Ordner braucht später eine ausdrückliche Desktop-Integration. Ein Fotoimport in die Web-App und ein vollständiger Export sind die vorgesehenen ersten Wege.

Der genaue technische Iststand und die nächste Arbeitseinheit stehen in [STATUS.md](STATUS.md). Der Einstieg für KI-Agenten steht in [AGENTS.md](AGENTS.md).

## Bereits angelegt

- 18 vorhandene Originalfotos im Ordner Tubes mit Dateiindex und Prüfsummen in inventar.sqlite.
- Die Sammlung Tubes, die fünf Themen und Lothar als Person mit Herkunftsangabe „laut Nutzer“.
- Ein Entwurf des relationalen Datenmodells in schema.sql.
- Der erwähnte BTB-Beleg als Arbeitsnotiz mit ausstehender Erfassung.

Die Fotos sind der Sammlung zugeordnet. Gegenstände, Abschriften und Werte werden anhand der jeweiligen Originale einzeln erfasst. Dadurch entstehen aus mehreren Ansichten desselben Gegenstands keine zusätzlichen Stücke. Die Datenbank enthält derzeit keine Verkaufspreise oder bestätigten Röhrenidentifikationen.

Der nächste Umsetzungsschritt ist ein technischer Durchstich mit einem Gegenstand, einer Notiz, einer eigenen Kategorie und einem Foto auf zwei Geräten. Er prüft die in docs/ABNAHME.md beschriebenen Fälle. Bei erfolgreichem Nachweis wird daraus die erste Inventar-App mit Anmeldung, Listen- und Detailansicht, Foto- und Belegzuordnung, Suche und Export. Danach folgen Recherche, Bewertung und Verkaufsablauf.

## Technische Belege

Die datierte Quellenliste und ihre Zuordnung zu Architekturentscheidungen stehen in [docs/QUELLEN.md](docs/QUELLEN.md). Die praktischen Gerätetests werden separat protokolliert.
