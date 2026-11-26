# Objekte, Medien und Wissen

Stand 26. November 2026. Dies ist der beschlossene Zielvertrag für die nächste Ausbaustufe. Die aktuelle Datenbank enthält Gegenstände, Kategorien, Gegenstandsnotizen und Befehlsprotokoll. Uploads, Bildnotizen, Merkmalsbelege, Quellen-/Preisdatensätze und Verarbeitungsversionen sind noch nicht implementiert. Der aktuelle Text-/JSON-Export umfasst nur vorhandene Objektangaben, Notizen und daraus erkannte HTTP-Links.

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

Der nächste durchgängige Ablauf ist Objekt öffnen, mehrere Fotos auswählen, bestätigten Upload sehen, Galerie öffnen und eine Aufnahme einem Hinweis zuordnen. Ein Upload zeigt erst nach Datei- und Metadatenbestätigung „hochgeladen“. Dateiauswahl, Aufnahmedatum aus EXIF, Uploadbeginn und bestätigter Upload sind verschiedene Ereignisse. Der sichtbare Verlauf soll beispielsweise „Robin · 26.11.2026, 14:32“ zeigen; die Speicherung verwendet eine eindeutige serverseitige Zeit mit Zeitzonenbezug.

Originale liegen privat. Vorschaubilder werden getrennt erzeugt; Darstellbarkeit von HEIC auf den Zielgeräten wird geprüft. Eine fehlende Vorschau darf nicht zur stillen Löschung oder Umwandlung des Originals führen. Wiederholbare Uploadvorhaben, Übertragungsabbruch und fremde Konten gehören zur Abnahme nach DATENVERTRAG.md.

Automatische Zuordnung erkennt exakte Dateiduplikate über den Hash und schlägt mögliche Objektduplikate anhand lesbarer Modell- und Serienangaben vor. Unsichere Übereinstimmungen werden nicht still zusammengeführt. Eine Seriennummer auf einem eingebauten Lautsprecher ist beispielsweise nicht automatisch die Seriennummer der gesamten Box.

## KI und OCR

Die bisherige MCP-Schnittstelle liefert Gegenstandsdaten und Texte, keine Bilddateien. Für visuelle Analyse wird ein autorisiertes Werkzeug benötigt, das die ausgewählte Aufnahme dem Modell tatsächlich zugänglich macht. Dateinamen, URLs oder nur für ein Widget bestimmte Metadaten ersetzen diese Bildübergabe nicht. Der vollständige ChatGPT-OAuth-Durchlauf und die tatsächliche visuelle Werkzeugantwort müssen im persönlichen Konto getestet werden.

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

Die seltene Aktion liegt im Objektmenü „⋯“. Die Auswahl umfasst künftig Objektangaben, einzelne Originalbilder, bestimmte Ableitungen, Notizen, erkannte Texte, Quellen/Links und optional Verlauf. Original und bearbeitete Fassung werden eindeutig benannt. Ein ZIP mit Manifest erhält Zuordnungen, Versionsbezüge und Hashes; zusätzlich können Text, JSON und geeignete Einzeldateien angeboten werden. Kleine Text-/JSON-Ausgaben sind bereits implementiert. Bild-/ZIP-Export folgt nach der echten Medienablage.

Ein öffentliches Verkaufsangebot bekommt nur bewusst gewählte Inhalte. Private Notizen, Lagerort und Verlauf dürfen nicht still mit allen Bildern exportiert werden. Große Archive sollen nicht vollständig im RAM eines iPhones zusammengesetzt werden; der konkrete Transportweg wird anhand des tatsächlichen Dateivolumens gewählt und geprüft.

## Bedienung

Die Hauptansicht enthält Suche, Objektliste und „+ Objekt“. Das geöffnete Objekt zeigt kompakte Bereiche für Objekt/Merkmale, Bilder, Notizen, Quellen und Verlauf, jeweils erst mit nutzbarer Funktion. Aktuell existieren die Reiter Objekt und Notizen. Großflächige Bilder, einheitliche Abstände und mindestens 44 Pixel hohe Touchziele sind die Vorgabe. Kategorieverwaltung, Konto und Download werden bei Bedarf geöffnet. Bestätigungen sind kurz, Fehler und Revisionskonflikte bleiben verständlich.

Keine Werbesätze, biografischen Einleitungen oder erklärenden Slogans in der Arbeitsoberfläche. Glass-Flächen erhalten dezente spektrale Kanten und farbige Reflexe. Leseflächen, Fotodarstellung und Formulare bleiben ruhig; reduzierte Transparenz entfernt die Effekte. Aufwendige dauernde Animationen werden für diesen Effekt nicht benötigt.

## Cache-Vertrag

TanStack Query 5.108.4 hält die Online-Lesedaten pro Konto und Abfrage. Bestätigte Schreibantworten aktualisieren passende Objekte sofort. Eine Notiz invalidiert ihr Objekt; eine Kategorie invalidiert ihren Kategorietyp; Objektänderungen invalidieren Objektlisten. Alte laufende Abfragen werden vorher abgebrochen. Andere Konten und unabhängige Daten werden nicht pauschal neu geladen. Frische Cache-Daten werden beim Zurückkehren wiederverwendet; veraltete Daten bei Fokus und erneuter Verbindung aktualisiert.

Ungespeicherte Formulare sind vom Lesecache getrennt und werden durch Hintergrundabfragen nicht ersetzt. Bei Kontowechsel wird der Cache im Arbeitsspeicher neu aufgebaut. Die lokale Lesekopie ist nach Konto getrennt und enthält zuletzt geladene Ansichten. Grenzen, Aktualisierung und Offline-Neustart stehen in [OFFLINE-UND-LAST.md](OFFLINE-UND-LAST.md).

## Primärquellen

- https://help.openai.com/en/articles/8400551-chatgpt-image-inputs-faq
- https://developers.openai.com/plugins/reference
- https://github.com/naptha/tesseract.js
- https://tesseract-ocr.github.io/tessdoc/FAQ.html
- https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation
- https://tanstack.com/query/latest/docs/framework/react/guides/updates-from-mutation-responses

Abruf am 26. November 2026. Die konkrete Bildübergabe und Bilderkennung wird am tatsächlichen ChatGPT-Konto geprüft. Paketversionen und Tests belegen ausschließlich die bereits implementierte Web-App.
