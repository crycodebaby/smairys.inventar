# Nächste Arbeitsschritte

Stand 26. November 2026. Die vorhandene Online-Basis trägt den ersten Inventarablauf. Sie ist noch keine abgenommene Offline-App. STATUS.md enthält Nachweise und offene Einschränkungen.

| Reihenfolge | Ergebnis | Abnahme |
| --- | --- | --- |
| 1 | Anmeldung auf der Live-Domain und direkt bedienbares Inventar | Frischen E-Mail-Link auf inventar.smairys.de öffnen. Einen Gegenstand mit Kategorie erfassen, ändern und eine angeheftete Abschrift mit separater Interpretation ergänzen. Auf zweitem Gerät zurücklesen. |
| 2 | Private Originalfotos und Belege am Gegenstand | Eigentümerbezogene Storage-Regeln, Dateimetadaten, SHA-256, getrennte Vorschauen und bestätigter Upload. Zweitkonto darf Originale nicht lesen. Reale iPhone-Dateien und Abbruch während des Uploads prüfen. |
| 3 | Persönliche ChatGPT-Verbindung | OAuth-Server, Zustimmungsseite und Token Hook konfigurieren. Mit echtem Benutzerkonto verbinden; denselben Gegenstand aus ChatGPT lesen und nach ausdrücklichem Auftrag ändern. Dieser Schritt kann parallel zur Fotoarbeit erfolgen. |
| 4 | Nachgewiesener Offlinebetrieb | Kostenlosen beziehungsweise budgetkonformen Abgleich anhand des engen Befehlsmodells auswählen. Oberflächen-Cache, persistente Entwürfe und Auftragswarteschlange mit Kontozuordnung, Dateiablage, Konfliktbehandlung und Wiederanlauf auf iPhone/iPad testen. |
| 5 | Recherche und Verkauf | Belegte Typbestimmung, Quellen, datierte Vergleichsverkäufe und Bewertungen ergänzen. Danach Angebot, Reservierung, Zahlung und Übergabe nachvollziehbar abbilden. |

## Aktuell implementierter Ausschnitt

Suche mit Seitennavigation, Gegenstand erfassen und bearbeiten, Kategorie mit Farbwahl neu anlegen und bei Erfassung zuordnen, Notizen mit Abschrift/Interpretation/Zuschreibung/Anheften. Änderungen verwenden dieselben vorhandenen Serverbefehle wie MCP. Bei Revisionskonflikten bleibt die Eingabe erhalten; bei unklarer Serverbestätigung wird im geöffneten Formular derselbe Auftrag wiederholt.

Die Arbeitsoberfläche wird ohne Slogans und Einleitungstexte geführt. Objekt und Notizen sind getrennte Reiter; Konto, Kategorien und selektiver Text-/JSON-Download liegen hinter bedarfsgesteuerten Menüs. Der Online-Lesecache verwendet TanStack Query mit gezielter Aktualisierung nach bestätigten Änderungen.

Der nächste Produktkern ist in MEDIEN-UND-WISSEN.md festgelegt: Objekt mit Galerie und Upload-Verlauf, direkt an Medien verknüpfbare Anmerkungen, belegte Merkmale mit menschlicher/KI-Herkunft sowie Quellen und getrennten Preisarten. Zuerst den Fotoablauf vollständig abnehmen, danach Quellen-/Vergleichseingabe und persönliche KI-Bildübergabe. OCR-PDFs, korrigierte Abschriften und Neuzeichnungen folgen auf dieser versionsfähigen Medienbasis.

Umbenennen oder Archivieren von Kategorien, spätere Kategorieänderungen am Gegenstand, frei zuweisbare Zustände und Markierungen sowie Bearbeiten/Löschen/Wiederherstellen von Notizen sind weitere Änderungen am Daten- und Befehlsvertrag. Die momentane Oberfläche stellt dafür keine funktionslosen Bedienelemente dar.

## Technische Grenzen

Formularentwürfe und Wiederholungsaufträge liegen aktuell im Arbeitsspeicher des geöffneten Fensters. Eine Warnung vor Verlassen ersetzt keine persistente Offline-Warteschlange. Vollständiger Export einschließlich echter Bilddateien und eine getestete Wiederherstellung gehören zur Foto-/Offline-Abnahme. Ein automatisierter Test in einem simulierten DOM ersetzt keine Geräteprüfung in Safari.
