# UI und UX

## Typografie

- Systemschrift auf allen Geräten. Ansichts- und Objekttitel skalieren mit der verfügbaren Breite. Eingabefelder bleiben bei mindestens 16 px, Hilfstext bei 14 px und Inventarnummern bei 13 px.
- Ein Titel je Ansicht. Aktionen verwenden kurze Verben wie „Speichern“, „Prüfen“ und „Herunterladen“. Statusmeldungen benennen den tatsächlichen Zustand.
- Zeilen dürfen bei größerer Systemschrift umbrechen. E-Mail-Adressen, IDs und URLs dürfen die Ansicht nicht verbreitern.

## Layout und Touch

- Abstände in Stufen von 4, 8, 12, 16, 24 und 32 px. Innerhalb einer Gruppe sind Abstände kleiner als zwischen Gruppen.
- Mindestens 44 × 44 px für zentrale Touchziele. Auf dem iPhone wird das gewählte Objekt als eigene Ansicht gezeigt. Auf breiteren Displays bleiben Liste und Detail nebeneinander.
- Die Seite verwendet den normalen Dokument-Scroll. In der einspaltigen Ansicht öffnet ein Objekt oben. Beim Zurückgehen stellt die App die Scrollposition der Liste wieder her. Auf Touchgeräten bleiben Scrollbalken und Scrollverhalten beim System. Die schlanken, abgedunkelten Scrollleisten gelten bei präzisem Zeiger mit Hover. Safe Areas halten Navigation und den auf dem iPhone unten erscheinenden Einstellungsdialog von Systembereichen frei.
- Die Oberfläche zeigt vorrangig Suche, Objekte und Erfassung. Konto und Synchronisierung stehen im Zahnrad, seltene Objektaktionen im Objektmenü. Die sichtbaren Texte dienen Navigation, Eingabe oder Rückmeldung.
- Dialoge brauchen einen eindeutigen Titel, eine sichtbare Schließen-Aktion und Rückkehr des Tastaturfokus zum Auslöser. Native Dialoge liefern den modalen Fokusrahmen.

## Material und Bewegung

- Die Grundfläche ist dunkel, mit gedämpftem Blau und Violett am oberen Rand. Die farbigen Reflexe entstehen aus geschichteten CSS-Verläufen an den Kanten der primären Aktion, der Einstellungen, des Objektmenüs und der aktuellen Auswahl. Der Text behält eine solide Vordergrundfarbe.
- Große Leseflächen und Eingaben haben deckende Hintergründe. Der Einstellungsdialog nutzt einen begrenzten Hintergrundfilter und hat eine deckende Variante für Browser ohne diesen Effekt. Der Web-Effekt braucht keine zusätzliche Bibliothek und keine Grafikberechnung pro Frame.
- Bewegung bestätigt einen Zustandswechsel. Das Zahnrad dreht sich beim Öffnen, sein Mittelpunkt verändert sich. Dauer etwa 180–230 ms. Bei reduzierter Bewegung erfolgt der Zustandswechsel direkt.
- Bei reduzierter Transparenz oder erhöhtem Kontrast erhalten die Glaselemente solide Flächen und sichtbare Grenzen. Aktive Zustände sind auch für assistive Technik über die jeweiligen ARIA-Zustände erkennbar.

## Abnahme vor Freigabe

- Auf iPhone und iPad mit Touch prüfen. Dialog öffnen und schließen, Felder ausfüllen, Liste und Objekt wechseln, bei eingeblendeter Tastatur speichern.
- Kurze und lange Inhalte, leere Liste, offline gespeicherter Auftrag und Fehlerzustände prüfen. Ein Erfolgszustand braucht eine lokale oder zentrale Bestätigung.
- Im Review Text ohne klare Aufgabe, doppelte Überschriften, verdeckte Bedienelemente und unnötige Bewegungen entfernen.

## Quellen

- [Apple, Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [Apple, Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
- [Apple, Platforms State of the Union, WWDC26](https://developer.apple.com/videos/play/wwdc2026/102/?id=206)
- [WebKit, Safe Areas auf iPhone](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)
- [W3C, WCAG 2.2, Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
