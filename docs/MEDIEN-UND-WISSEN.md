# Objekte, Medien und Wissen

Stand 26. November 2026. Der Medienablauf erfasst private Fotos und PDF-Belege am Gegenstand, zeigt JPEG-Vorschauen und stellt die Originale zum Download bereit. Eine Notiz kann über die Datei erstellt werden und trägt dann ihren Quellenbezug. Der folgende Zielvertrag beschreibt auch Bildbereiche, Merkmalsbelege, weitere Versionen und Quellen-/Preisdatensätze.

## Produktkern

Ein Objekt ist der gemeinsame Bezug für Fotos von mehreren Seiten, Typenschilder, handschriftliche Blätter, eigene Einträge und Internetrecherche. Eine fotografierte Ampeg-Box bekommt eine Objekt-ID; ihre zehn Fotos erzeugen zehn Medienbezüge zu diesem Objekt. Beziehungen bilden Zuordnung ab, ohne Dateien unnötig zu kopieren. Die technische Identifikation kann sich ändern, während die Objekt-ID und die Inventarnummer erhalten bleiben.

| Datensatz | Aufgabe und erforderlicher Bezug |
| --- | --- |
| Medium | Eigene ID, Eigentümer, Titel, Objektbezug und Originalversion. Ein Original kann später ausdrücklich mehreren Objekten zugeordnet werden. |
| Dateiversion | Unveränderliche Datei mit SHA-256, Bytezahl, MIME-Typ, Originalname, Elternversion, Bearbeitungsart und Speicherbezug. Vorschau und OCR-PDF sind eigene Ableitungen. |
| Anmerkung | Wortlaut, Interpretation, Tags und optionaler Bildbereich. Ein Bereich bezieht sich auf eine bestimmte Version mit definierten Koordinaten und Orientierung. |
| Merkmalsbeleg | Feld, Wert, Einheit, Originalwortlaut, Quelle, Autor/Verarbeitungsherkunft, Zeitpunkt und Prüfstatus. Beispielsweise Seriennummer aus einem benannten Typenschildfoto. |
| Quelle / Vergleich | URL, Titel, Funddatum, Objektbezug, Quellentyp, Zustand und gegebenenfalls Betrag, Währung, Preisart und Verkaufsdatum. |
| Ereignis | Vom Server gesetzter Zeitpunkt, authentifizierter Benutzer und Handlung. Bei delegierten KI-Aufträgen zusätzlich Client-/Agentbezug. |

Neue Felddefinitionen sollen als Daten erweiterbar werden. Begriffe und Tags haben stabile IDs. Ein Bild kann eigene Markierungen und Notizen bekommen; das ist zusätzlich zu einer Kategorie des gesamten Objekts möglich. Beziehungen und Fremdschlüssel prüfen jeweils denselben Eigentümer. Benutzer- und Zeitangaben werden für den Verlauf serverseitig abgeleitet, nicht aus frei übergebenen Anzeigenamen als Berechtigung übernommen.

## Fotos zuerst

Im Reiter **Medien** sind bis zu zwölf Dateien je Auswahl möglich. Jede Datei bekommt einen stabilen Medienbezug. Die PostgreSQL-Bestätigung prüft Vorhandensein, Dateigröße und MIME-Typ im Storage und setzt den Uploadzeitpunkt. Das Dateifenster zeigt das angemeldete Konto und den bestätigten Uploadzeitpunkt. Dateiauswahl, EXIF-Aufnahmedatum und bestätigter Upload sind verschiedene Ereignisse. Ein späterer Verlauf und Anmerkungen können auf diesen Medienbezug aufbauen.

Originale liegen im privaten Bucket `inventory-media`. RLS erlaubt authentifizierte Downloads bestätigter Dateien beim Inventareigentümer. Die App erzeugt lokale Blob-URLs zur Anzeige und stellt keine teilbaren Dateilinks aus. Der Browser berechnet SHA-256 für das empfangene Original und vergleicht den Hash beim Download. Eine zweite Auswahl desselben Inhalts am selben Objekt verwendet denselben Datensatz. Der Server kontrolliert beim Bestätigen Dateigröße und MIME-Typ. JPEG-Vorschauen werden separat erzeugt und haben maximal 720 Pixel Kantenlänge und 256 KiB. Ein PDF erscheint mit Dateityp und Originaldownload. HEIC/HEIF bleibt als Original gespeichert, auch wenn der Browser das Format nicht anzeigen kann.

Die nächste Importstufe verknüpft die 18 geprüften Tubes-Originale mit der Sammlung und dokumentiert die spätere Zuordnung. Exakte Dateiduplikate verwenden den Hash. Mögliche Objektduplikate anhand lesbarer Modell- und Serienangaben werden später zur Prüfung vorgeschlagen. Eine Seriennummer auf einem eingebauten Lautsprecher gehört gegebenenfalls nur zum Lautsprecher.

Bis 6 MiB läuft der Upload als direkter Versuch. Für größere Dateien bis 25 MiB verwendet die App den nachgeladenen `tus-js-client` zur Wiederaufnahme. Originale werden zunächst je Konto und Projekt mit Namen und Dateityp in IndexedDB gespeichert. Nach einem Neustart zeigt der Medienreiter ausstehende Dateien an. Dort kann der Upload erneut gestartet oder der lokale Auftrag entfernt werden. Die Warteschlange fasst bis zu 24 Dateien und insgesamt 150 MiB. Bei der nächsten Upload-Reservierung räumt der Server über 48 Stunden alte Reservierungen desselben Objekts auf, sofern weder Original noch Vorschau gespeichert sind. Vorhandene Dateien bleiben für die Bestätigung verfügbar.

## Dateibezogene Notizen

Im Dateifenster öffnet „Notiz zur Datei“ das vorhandene Notizformular mit Quellenbezug. Abschrift, Einordnung, Zuschreibung und Anheften bleiben getrennt. Eine gespeicherte Notiz öffnet die Quelldatei über den Dateinamen. Ist die Datei noch nicht in der Medienliste dieses Geräts, wird die Liste einmal aktualisiert. Der Text-Export enthält den Dateinamen, der JSON-Export zusätzlich die Medien-ID.

Der Schreibauftrag speichert die Medien-ID über dieselbe Offline-Warteschlange wie eine gewöhnliche Notiz. Der Server akzeptiert nur ein bestätigtes Medium desselben Objekts und Kontos. Ein zusammengesetzter Fremdschlüssel bindet die Zuordnung auch auf Datenbankebene. Browser- und SQL-Tests prüfen Offline-Neustart, korrektes Wiederöffnen, unveränderte Wiederholung des Schreibauftrags sowie Ablehnung unbestätigter oder falsch zugeordneter Dateien.

## KI und OCR

Die MCP-Schnittstelle liefert Gegenstandsdaten und Texte. Die private Galerie wird über die direkte App-Anmeldung geöffnet. Für die spätere visuelle Analyse bekommt ein lesendes Werkzeug eine konkrete Medien-ID und liefert eine begrenzte Bildableitung als MCP-Bildinhalt. Das Werkzeug prüft Eigentümer und Berechtigung vor dem Lesen. Die Aufnahme muss im tatsächlichen Chat für das Modell auswertbar sein. Der vollständige OAuth-Durchlauf und eine visuelle Werkzeugantwort sind dafür die Abnahme.

Der KI-Auftrag soll einen lesenden Teil und daraus abgeleitete Vorschläge liefern: Aufdruck, Modell, Farbe, Seriennummer und andere belegbare Merkmale jeweils mit Foto-/Versionsbezug. Maße werden nur aus einer lesbaren Maßangabe oder einem belegbaren Maßstab übernommen. Schätzungen bleiben ausdrücklich als solche getrennt. Widersprechende Lesungen bleiben bis zur Auflösung erhalten. „KI-Vorschlag“, „vom Nutzer geprüft“ und „durch Quelle belegt“ sind verschiedene Zustände. Eine vom Modell erfundene Prozentzahl gilt nicht als gemessene Erkennungssicherheit.

Gedruckte Rechnungen und Aufkleber eignen sich für einen zunächst bedarfsgesteuerten OCR-Versuch. Tesseract.js kann im Browser/Worker laufen; seine Modelle und Arbeitsdateien müssen für das iPhone gesondert auf Speicherverbrauch geprüft werden. PDF-Eingaben benötigen vor Tesseract.js einen eigenen Seiten-/Textextraktionspfad. Für Lothars Handschrift ist Tesseract kein zuverlässiger Standardweg; KI-Lesung und manuelle Korrektur werden als überprüfbare Abschrift gespeichert.

Eine automatisch gestartete Bildanalyse über eine kostenpflichtige Modell-API ist nicht eingerichtet. Der persönliche ChatGPT-Weg und ein eventueller späterer API-Verarbeitungsdienst bleiben technisch und hinsichtlich ihrer Kosten getrennt.

## Versionen statt Überschreiben

| Ergebnis | Speicherung |
| --- | --- |
| Hochgeladenes Foto/Blatt | Unveränderte Originaldatei |
| Geraderichtung, Zuschnitt, Kontrast | Neue Bildableitung mit Elternversion und Bearbeitungsschritten |
| Erkannter Text | Suchbarer Text plus Layout/Bereiche, Engine/Version, Zeitpunkt und Prüfstatus |
| Durchsuchbares PDF | Zusätzliche Ableitung mit Bild und Textschicht, auf die Quellversion zurückgeführt |
| Klare Abschrift | Eigenes Dokument, das Originalwortlaut und unsichere Stellen erhält |
| Bereinigte Zeichnung | Neue SVG-/PDF-/Bildableitung, als Rekonstruktion gekennzeichnet und mit Original vergleichbar |

OCR-PDF und neu gesetzte Abschrift erfüllen unterschiedliche Aufgaben. Eine Neuzeichnung muss Werte, Leitungsverbindungen und fehlende Stellen prüfbar machen; schöne Geometrie allein belegt keine inhaltliche Richtigkeit. Das Original wird niemals durch eine rekonstruktive Fassung ersetzt. Regionmarkierungen bleiben an ihre Quellversion gebunden und werden nicht ungeprüft auf einen gedrehten oder beschnittenen Nachfolger übertragen.

## Recherche und Preisvergleiche

Eine Quelle wird per URL und kurzer Notiz erfasst, ohne vorher eine vollständige Recherche verlangen zu müssen. Spätere Ergänzungen bekommen Zeit- und Herkunftsbezug. Für eBay und andere Plattformen sind Angebotspreis, nachgewiesener Verkaufspreis und eigene Schätzung getrennte Preisarten. Zustand, Umfang, Währung, Versand und Vergleichbarkeit gehören zum Beleg. Ein sichtbarer Preis in einer Anzeige beweist keinen Verkauf.

Externe Seiten können verschwinden oder Anmeldung verlangen. Deshalb Funddatum und die konkret belegte Aussage speichern; bei geeigneter Berechtigung zusätzlich einen Auszug oder Beleg. Automatisches Abrufen beliebiger URLs benötigt einen begrenzten Serverpfad mit Schutz vor internen Netzwerkzielen. Ein eingefügter Link führt aktuell keinen automatischen Abruf aus.

## Selektiver Download

Das Objektmenü „⋯“ bietet kleine selektive Text-/JSON-Downloads und ein ZIP-Objektarchiv mit bestätigten Originalen, Notizen, Kategorie, Medienzuordnung und SHA-256-Werten. Unter **Einstellungen → Objektarchiv** kann das ZIP als Objekt importiert werden. Der Import prüft alle Originale vor dem ersten Schreibzugriff und ordnet Notizen den neu gespeicherten Dateien zu. Wiederholung desselben Archivs setzt einen teilweise abgeschlossenen Import fort. Die App importiert eine neue Inventarnummer und neue Zeitstempel. Ursprüngliche Nummer und Notizzeitpunkte bleiben im Manifest. Der Browserablauf ist auf 64 MiB pro Objektarchiv begrenzt.

Die Archivabnahme hat zwei echte lokale JPEGs aus „Tubes“ durch Export und Import in einen leeren Testbestand geführt. Beide Prüfsummen und beide Notizbezüge stimmten. Die Originale blieben lokal. Der vollständige Produktions- und Gerätetest auf Safari ist gesondert offen.

Ein öffentliches Verkaufsangebot bekommt nur bewusst gewählte Inhalte. Private Notizen, Lagerort und Verlauf dürfen nicht still mit allen Bildern exportiert werden. Große Archive sollen nicht vollständig im RAM eines iPhones zusammengesetzt werden; der konkrete Transportweg wird anhand des tatsächlichen Dateivolumens gewählt und geprüft.

## Bedienung

Die Hauptansicht enthält Suche, Objektliste und „+ Objekt“. Aktuell existieren die Reiter Objekt, Medien und Notizen. Quellen und Verlauf erscheinen, sobald ihre Funktionen verfügbar sind. Großflächige Bilder, einheitliche Abstände und mindestens 44 Pixel hohe Touchziele sind die Vorgabe. Kategorieverwaltung, Konto und Download werden bei Bedarf geöffnet. Bestätigungen sind kurz, Fehler und Revisionskonflikte bleiben verständlich.

Keine Werbesätze, biografischen Einleitungen oder erklärenden Slogans in der Arbeitsoberfläche. Glass-Flächen erhalten dezente spektrale Kanten und farbige Reflexe. Leseflächen, Fotodarstellung und Formulare bleiben ruhig; reduzierte Transparenz entfernt die Effekte. Aufwendige dauernde Animationen werden für diesen Effekt nicht benötigt.

## Cache-Vertrag

TanStack Query 5.108.4 hält die Online-Lesedaten pro Konto und Abfrage. Bestätigte Schreibantworten aktualisieren passende Objekte sofort. Eine Notiz invalidiert ihr Objekt; eine Kategorie invalidiert ihren Kategorietyp; Objektänderungen invalidieren Objektlisten. Alte laufende Abfragen werden vorher abgebrochen. Andere Konten und unabhängige Daten werden nicht pauschal neu geladen. Frische Cache-Daten werden beim Zurückkehren wiederverwendet; veraltete Daten bei Fokus und erneuter Verbindung aktualisiert.

Ungespeicherte Formulare sind vom Lesecache getrennt und werden durch Hintergrundabfragen nicht ersetzt. Bei Kontowechsel wird der Cache im Arbeitsspeicher neu aufgebaut. Die lokale Lesekopie ist nach Konto getrennt und enthält zuletzt geladene Ansichten. Grenzen, Aktualisierung und Offline-Neustart stehen in [OFFLINE-UND-LAST.md](OFFLINE-UND-LAST.md).

## Primärquellen

- [Supabase, standardisierte und wiederaufnehmbare Uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)
- [Supabase, Zugriffskontrolle auf private Dateien](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase, Plananforderungen der Bildtransformationen](https://supabase.com/docs/guides/storage/serving/image-transformations)
- [WebKit, HEIC-Unterstützung in Safari](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/)

- https://help.openai.com/en/articles/8400551-chatgpt-image-inputs-faq
- https://developers.openai.com/plugins/reference
- https://github.com/naptha/tesseract.js
- https://tesseract-ocr.github.io/tessdoc/FAQ.html
- https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation
- https://tanstack.com/query/latest/docs/framework/react/guides/updates-from-mutation-responses

Abruf am 26. November 2026. Die konkrete Bildübergabe und Bilderkennung wird am tatsächlichen ChatGPT-Konto geprüft. Paketversionen und Tests belegen ausschließlich die bereits implementierte Web-App.
