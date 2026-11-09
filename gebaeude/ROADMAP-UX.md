# Roadmap Nutzererfahrung: Gebäude-Werkzeug auf dem Prüfstand

Stand: 09.11.2026, Version 273 (Phase 0 umgesetzt, Abschnitt 7; Modul-Aufteilung und Selbsttest, Abschnitt 8; Phase 1 erster Stand, Abschnitt 9). Schwerpunkt ist das Gebäude-Werkzeug (`building.js`), das hauptsächlich am **Desktop** (Mac, großer Bildschirm, Maus, Tastatur) benutzt wird; das iPad bleibt zweite Plattform. Der Rohrbiege-Assistent bleibt vorerst unverändert, der letzte Abschnitt zeigt nur, wie er später in dieselbe Oberfläche passt.

Die Roadmap ist in Phasen geordnet. Jede Phase ist für sich nutzbar, Phase 0 sind Fehler, die vor allem anderen behoben werden.

---

## 1. Befund

### 1.1 Aufbau der Oberfläche heute

| Bereich | Wo | Inhalt |
|---|---|---|
| Kopfzeile | oben links / Mitte / rechts | Projektmanager-Knopf, Gebäude-Knopf (Gebäude öffnen, neu, sichern, IFC), Rückgängig/Wiederholen, Geschoss-Auswahl, Schließen |
| Werkzeugleiste | unten Mitte, schwebend | Auswählen, Wand, Stütze, Träger, Decke, Öffnung, „…“ (Treppe, Dach, Rasterdecke, Raum, Schacht, Achse), Messen, Grundriss/3D, Einpassen |
| Befehlsleiste | unten, über der Werkzeugleiste | Aufforderung, Auswahlknöpfe des Befehls, Ortho/Mitte/Fang, Fertig/Abbrechen |
| Tafel | rechts oben, schwebend | Eigenschaften der Auswahl und Aktionen |
| Projektmanager | links, aufklappbar | Struktur und Layer, darunter Knöpfe Geschosse, Raster, Unterlage |
| Dialoge | schwebende Karten | 9 Stück: Geschosse, Raster erzeugen, Planunterlage, Gebäude, Neues Gebäude, Rasterdecke, Dach, Fenster gestalten, Treppe |
| Kleine Popups | an Knöpfen und Maßen | Auswahllisten, Fang-Schalter, Maß-Editor, Geschoss-Liste |

Rund 70 verschiedene Aktionen verteilen sich auf diese Orte. Für viele gibt es genau einen Weg, und der ist oft nicht dort, wo man ihn sucht: Geschosse stecken im Projektmanager-Fuß, Kalibrieren im Unterlage-Dialog, IFC hinter dem Gebäude-Knopf, Dachdetails in einem Dialog aus der Tafel heraus.

### 1.2 Was gut ist und bleiben soll

- Ein flaches, verständliches Datenmodell (Gebäude → Geschosse → Bauteile mit `storey` und `host`), Speicherung lokal in IndexedDB, IFC-Export.
- Befehle mit Aufforderung, Fang, Fluchten, Ortho, eingetippten Längen – das ist CAD-Arbeitsweise und funktioniert.
- Antippbare Maße (Achsraster, Öffnungen, Durchbrüche) – genau diese Art des Bearbeitens sollte zum Standard für alle Bauteile werden.
- Rückgängig für jede Änderung, automatische Speicherung.

### 1.3 Schwächen im Konzept

1. **Mobile Muster auf dem Desktop.** Schwebende Leisten unten, schwebende Tafel, Karten-Dialoge: das ist für das Telefon gebaut. Am Desktop verdecken sie das Modell, springen in Größe und Lage und bieten zu wenig Platz für Eigenschaften.
2. **Kein fester Ort für Eigenschaften.** Ein Teil steht in der Tafel, ein Teil in Dialogen (Dach, Treppe, Rasterdecke, Fenster), ein Teil in der Befehlsleiste. Wer ein Fenster ändern will, sucht an drei Stellen.
3. **Dialoge sind modal gedacht, aber nicht modal gebaut.** Sie bleiben offen, während man weiterarbeitet, hängen aber an dem Bauteil, für das sie geöffnet wurden (siehe Fehler F2). Entweder richtig an die Auswahl binden oder ganz abschaffen.
4. **Typ und Exemplar sind nicht getrennt.** Jede Wand trägt Dicke und Art selbst, jedes Fenster seine Teilung. Es gibt keine Wandtypen mit Schichten, keine Fenstertypen, keine Stützentypen. Ändern „aller 36,5er-Außenwände“ geht nur über Mehrfachauswahl.
5. **Beziehungen sind nur geometrisch.** Ob eine Stütze an einer Achse hängt, ob zwei Wände verbunden sind, ob ein Raum an Wänden hängt, wird jedes Mal aus Koordinaten abgeleitet (1 mm Toleranz). Das ist robust für einfache Fälle, aber unsichtbar und nicht steuerbar (Ausnahme: „Von der Achse gelöst“).
6. **Zwei Bedienmuster für dasselbe.** Segmentknöpfe und Auswahlknöpfe stehen nebeneinander; manche Werte sind Felder in der Leiste, andere in Listen. Achsen haben antippbare Maße, Wände und Stützen nicht.
7. **Eine Datei, 3.500 Zeilen.** Oberfläche, Geometrie, Fang, IFC und Speicher in einem Modul. Jede Änderung trifft alles, Fehler wie F2 entstehen an den Nahtstellen.

### 1.4 Datenmodell im Detail

| Thema | Heute | Problem | Ziel |
|---|---|---|---|
| Version | keine Schemaversion | alte Gebäude werden still „repariert“ (`fixB`), Felder kommen dazu ohne Plan | `B.schema` und eine Kette von Migrationen |
| Bauteiltypen | Werte am Exemplar (`t`, `kind`, `prof`, Fenster-`cfg`) | keine Typen, keine Schichten | Katalog `B.types` (Wand-, Decken-, Stützen-, Fenster-, Türtypen), Exemplar verweist mit `type` und überschreibt nur Abweichungen |
| Höhen | teils absolut (`ceil.z`), teils relativ (`sill`, `base`), teils automatisch (`h: null` = bis Decke) | schwer zu erklären | jede Höhe als Bezug + Versatz: „UK Decke darüber −0“, „OK Rohdecke +900“ |
| Beziehungen | aus Geometrie abgeleitet | unsichtbar, Toleranz 1 mm | gespeicherte Verknüpfungen: `joins` (Wand–Wand, Wand–Stütze), `grid` (Achsbindung), `host`; Ableitung nur beim Anlegen |
| Öffnungen | `at` = Mitte ab Wandanfang | dreht sich mit, wenn die Wand umgedreht wird; Bezug nicht wählbar | Bezug wählbar (Wandanfang, Wandende, Achse, nächste Kante) und gespeichert |
| Räume | Umriss als Punkte, einmal erkannt | wandern nicht mit, wenn Wände sich ändern | Raum = Startpunkt + Begrenzungen, Umriss wird neu berechnet (wie Revit) |
| Achsen | Linien mit Namen, Gruppen abgeleitet | Gruppen-Seite der Maßkette steckt an den Achsen | `B.gridSets` mit Seite, Nummerierung, Sichtbarkeit |
| Rückgängig | ganzes Gebäude als Text je Schritt | großes Gebäude = viel Speicher, kein Name für den Schritt | Änderungslisten mit Namen („Fenster verschoben“), im Menü sichtbar |
| Geometrie | bei jedem Zeichnen neu (Wandstücke, Ecken, Fang) | große Modelle werden langsam | Zwischenspeicher je Bauteil, ungültig bei Änderung |

### 1.5 Parametrische Objekte

| Objekt | Parameter heute | fehlt für gute Bedienung |
|---|---|---|
| Wand | Art, Dicke, Lage zur Achse, Höhe/Fuß, Ecken automatisch | Wandtyp mit Schichten; Anschluss an Stützen (stumpf, nicht Gehrung); Kopf- und Fußbezug; antippbare Länge und Abstände; Ecke von Hand: Gehrung / stumpf / durchlaufend |
| Stütze | Form, Maß/Profil, Drehung, Höhe | Typ; Bezug Achse/Wand sichtbar; Abstände zu Achsen als Maße; Drehung per Griff |
| Träger | Art, Maß/Profil, OK | Auflager an Stützen/Wänden; Länge folgt den Auflagern |
| Decke | Umriss, Dicke, Bodenplatte | Bezug an Wände (Rand folgt), Aussparungen bearbeiten, Gefälle |
| Dach | Art, Neigung je Kante, Traufe, Attika | eigenes Kontextband statt Dialog; Firstlinie als Griff |
| Treppe | Form, Breite, Stufen, Wende | Steigung/Auftritt als Regel (Schrittmaßregel) mit Warnung; Lauflinie sichtbar |
| Fenster/Tür | Größe, Brüstung, Teilung, Öffnungsarten, Vorlagen | Typen statt Vorlagen; Laibung, Anschlag; Bezug wählbar; Liste aller Fenster |
| Rasterdecke | Plattenmaß, Raster-Start, herausgenommene Platten | Bezug zum Raum fest; Randstreifen-Regel |
| Raum | Name, Nummer, Fläche | Umriss folgt Wänden; Höhe, Volumen, Nutzung |
| Achse | Name, Köpfe, Gruppen, Bindung | Achsgruppen als Objekt; Schräge Achsen mit Winkelmaß |

### 1.6 Fehler und Ungereimtheiten (belegt)

| Nr. | Fehler | Ursache im Code |
|---|---|---|
| F1 | **Zahlen mit Tausenderpunkt werden falsch gelesen.** „1.260“ wird zu 1,26 mm. Schlimmer: Die App schreibt selbst „1.260“ in die Felder; wer dort nur eine Ziffer ändert, bekommt einen Wert um den Faktor 1000 zu klein. | `num()` ersetzt nur das Komma durch einen Punkt und lässt `parseFloat` den Tausenderpunkt als Dezimalpunkt lesen. Nur die Achsabstände (`parseSpacing`) behandeln den Punkt richtig. |
| F2 | **„Fenster gestalten …“ bleibt am ersten Fenster hängen**, wenn man danach ein anderes Fenster wählt. Dasselbe gilt für Dach, Treppe und Rasterdecke. | Der Dialog merkt sich beim Öffnen `dlg.el` und liest nie wieder die Auswahl. |
| F3 | **Stützen an Wandecken:** Die auf Gehrung laufenden Wände bleiben als Linien sichtbar, obwohl die Stütze die Ecke ausfüllt. | Die Körper der Wand werden ausgespart (`wallPieces`), die **Kantenlinien** aber aus dem ungeschnittenen Umriss gezeichnet (`prism(footprint(e), …, lines)`). Zusätzlich bleibt die Gehrung selbst bestehen: Treffen sich zwei Wände an einer Stütze, sollten beide stumpf an der Stützenfläche enden. |
| F4 | Bei einer gewählten Öffnung erscheinen alte orange Maße am Fußboden zusätzlich zu den neuen blauen Maßen. | Altes Grundrissmaß „ab Wandanfang“ wird weiter gezeichnet. |
| F5 | Enge Maßketten: Zahlen berühren Maßstriche, Ketten benachbarter Achsgruppen überlagern sich. | Feste Abstände der Ketten, keine Kollisionsprüfung. |
| F6 | Nach einem Update zeigte der Browser manchmal die alte Version. | **Kein App-Fehler:** Der Service Worker holt zuerst vom Netz und nimmt den Cache nur, wenn der Server nicht erreichbar ist. Es trat auf, wenn der lokale Testserver gestoppt war. |
| F7 | Flächenfang in 3D wirkt nur beim Messen. | bewusst eingeschränkt, weil Flächen den Ortho-Fang beim Zeichnen überdecken. |
| F8 | Räume, Decken- und Dachumrisse folgen weder Wänden noch Achsen. | Umrisse sind feste Punkte (siehe 1.4). |

---

## 2. Leitbild

**Ein Ort für jede Art von Handlung:**

- **Befehle** (etwas Neues anlegen oder eine Aktion ausführen) stehen im **Menüband** oben.
- **Eigenschaften** (etwas Gewähltes ändern) stehen in der **Eigenschaften-Palette** rechts. Immer, für jedes Bauteil, ohne Dialog.
- **Struktur** (Geschosse, Bauteile, Layer, Ansichten) steht im **Projektbrowser** links.
- **Zustand** (Fang, Ortho, Koordinaten, Aufforderung, Einheiten) steht in der **Statusleiste** unten.
- **Maße im Modell** sind antippbar und ändern das Bauteil direkt.

Dialoge gibt es nur noch für zwei Dinge, die wirklich einen eigenen Arbeitsbereich brauchen: den **Fenster-/Tür-Editor** und **Neues Gebäude**. Beide hängen an der Auswahl oder sind modal (siehe Regel R3).

### 2.1 Desktop-Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Gebäude ▾  Start  Tragwerk  Öffnungen  Ausbau  Raster+Plan  Messen  Ansicht   │  Reiter
│ ┌────────────┬────────────┬─────────────┬───────────┬─────────────┐            │
│ │ Wand ▾ Stütze ▾ │ Decke ▾ Dach │ Ändern: Verschieben Kopieren … │ Auswahl  │  Menüband
│ └────────────┴────────────┴─────────────┴───────────┴─────────────┘            │
├─ Optionsleiste: Wand · Typ [Außenwand 36,5 ▾] · Lage [Mittig ▾] · Höhe [bis UK Decke ▾] · Länge [____] ┤
├───────────────┬──────────────────────────────────────────────┬─────────────────┤
│ Projektbrowser │                                              │ Eigenschaften   │
│ ▾ Geschosse    │                                              │ Fenster F-03    │
│   ▸ DG         │                  Modell                      │ Typ: DK 2-flg ▾ │
│   ▾ EG ●       │                                              │ ─ Lage ──────── │
│     Wände (24) │                                              │ Breite   1.260  │
│     Räume (8)  │                                              │ Brüstung   900  │
│ ▸ Achsen       │                                              │ ─ Teilung ───── │
│ ▸ Unterlagen   │                                     [Würfel] │ [Fenster-Editor]│
│ ▸ Ansichten    │                                              │                 │
├───────────────┴──────────────────────────────────────────────┴─────────────────┤
│ Wand: nächsten Punkt tippen · X 12.400 Y 3.250 │ Fang ▾ 7/8 · Ortho · Raster │ EG │  Statusleiste
└──────────────────────────────────────────────────────────────────────────────┘
```

- Paletten links und rechts sind andockbar, einklappbar (Kante anklicken) und in der Breite verstellbar. Breite wird gemerkt.
- Das Modell wird nie von schwebenden Karten verdeckt. Einpassen rechnet mit der freien Fläche.
- Das Menüband lässt sich auf eine Zeile (nur Reiter) einklappen; Doppelklick auf einen Reiter klappt es auf.

### 2.2 Menüband (Ribbon) – warum und wie

Ein Menüband ist hier sinnvoll, weil es rund 70 Aktionen **sichtbar und gruppiert** anbietet, die heute auf Kopfzeile, Werkzeugleiste, „…“-Menü, Projektmanager-Fuß, Tafel und Dialoge verteilt sind. Es ersetzt dabei fünf der neun Dialoge.

**Reiter und Gruppen (Vorschlag):**

| Reiter | Gruppen und Befehle |
|---|---|
| **Gebäude** (Datei-Bereich, ganzseitig) | Neu, Öffnen (Liste mit Vorschau), Umbenennen, Duplizieren, Löschen · Sichern als Datei, Laden aus Datei · IFC exportieren, Bild exportieren · Einstellungen (Einheiten, Fang-Vorgaben) |
| **Start** | Auswählen · Wand ▾, Stütze ▾, Decke ▾ (die drei häufigsten) · Ändern: Verschieben, Kopieren, Spiegeln, Drehen, Teilen, Löschen · Zwischenablage · Rückgängig-Liste |
| **Tragwerk** | Wand ▾ (Typen), Stütze ▾, Träger ▾, Decke, Bodenplatte · Verbinden: Ecken verbinden, Anschluss an Stütze, Wandzug wählen · Auf Achsschnitte setzen |
| **Öffnungen** | Tür ▾, Fenster ▾, Wanddurchbruch, Deckendurchbruch, Schacht · Fenster-Editor · Typen verwalten |
| **Ausbau** | Raum, Raumstempel · Rasterdecke, Rasterstart, Platten herausnehmen · Treppe ▾ · Dach ▾ |
| **Raster + Plan** | Achse, Parallele Achse, Raster erzeugen, Neu nummerieren, Maßketten-Seite · Unterlage laden, Kalibrieren, Ausrichten, Verschieben, Deckkraft · Geschosse (öffnet den Geschoss-Bereich im Projektbrowser) |
| **Messen** | Abstand, Kette, Fläche, Bauteil · Mengen (Liste aller Flächen/Längen) · Prüfen (Schrittmaß Treppe, offene Räume) |
| **Ansicht** | Grundriss, 3D, Würfel-Richtungen · Einpassen, Auf Auswahl · Darüber anzeigen, Gelände · Layer · Darstellung (Linien, Schatten, Durchsicht) · Gespeicherte Ansichten |

**Kontext-Reiter** (erscheinen rechts, farbig, wenn etwas gewählt ist – wie „Ändern | Wände“ in Revit): Wand, Stütze, Fenster/Tür, Decke, Dach, Treppe, Achse, Raum. Sie enthalten nur die Aktionen für die Auswahl (z. B. Wand: Teilen, Umkehren, Wandzug, Ecke verbinden/lösen, Von Achse lösen, Typ ändern). Die Werte selbst stehen in der Eigenschaften-Palette.

**Optionsleiste** direkt unter dem Menüband ersetzt die heutige Befehlsleiste unten: Sie zeigt, solange ein Befehl läuft, dessen Einstellungen (Typ, Lage, Höhe, Länge) mit den bestehenden Auswahlknöpfen. Die Aufforderung wandert in die Statusleiste.

**iPad:** dasselbe Menüband, aber einzeilig mit Symbolen und Text darunter; Paletten als Seitenblätter, die über das Modell gleiten. Telefon wird nicht mehr eigens optimiert.

### 2.3 Was aus den neun Dialogen wird

| Dialog heute | künftig |
|---|---|
| Geschosse | Projektbrowser-Bereich „Geschosse“ (Liste, Höhe direkt editierbar, Rechtsklick: oben/unten einfügen, kopieren, löschen) + Eigenschaften des gewählten Geschosses |
| Raster erzeugen | Reiter Raster+Plan, Befehl „Raster erzeugen“ mit Werten in der Optionsleiste und Live-Vorschau im Modell |
| Planunterlage | Reiter Raster+Plan + Eigenschaften der Unterlage (Deckkraft, Drehung, Maßstab) |
| Gebäude | ganzseitiger Bereich „Gebäude“ (wie „Datei“ in Office) |
| Neues Gebäude | bleibt als Assistent (modal, ein Schritt), Einstieg im Bereich „Gebäude“ |
| Rasterdecke | Eigenschaften-Palette (Plattenmaß, Unterkante, Start) + Kontext-Reiter (Rasterstart, Platten) |
| Dach | Eigenschaften-Palette (Art, Neigung je Kante als Tabelle, Attika) + Griffe im Modell |
| Treppe | Eigenschaften-Palette (Form, Breite, Steigung/Auftritt mit Prüfung) |
| Fenster gestalten | **Fenster-Editor** als andockbarer Bereich, **gebunden an die Auswahl**; bei Mehrfachauswahl gleicher Fenster gilt er für alle |

Ergebnis: von 9 Dialogen auf 1 Assistenten und 1 Editor.

---

## 3. Regeln für jede Eingabe und jede Anzeige

| Nr. | Regel |
|---|---|
| R1 | **Ein Zahlen-Leser für alles.** Deutsches Format: „1.260“, „1260“, „1 260“, „1.260,5“ und „1260,5“ ergeben dasselbe. Ein Punkt gefolgt von genau drei Ziffern ist Tausendertrenner, sonst Dezimalzeichen. Rechenausdrücke erlaubt: „2*1260+115“, „6000/3“. Einheiten im Feld: „1,26 m“, „126 cm“. |
| R2 | **Felder zeigen beim Bearbeiten den nackten Wert** („1260“), beim Anzeigen formatiert („1.260“). Ungültige Eingabe färbt das Feld rot und behält den alten Wert. |
| R3 | **Alles Bearbeitende hängt an der aktuellen Auswahl.** Wechselt die Auswahl, zeigt jeder offene Bereich das neue Bauteil oder schließt sich. Nie ein unsichtbares „altes“ Ziel. |
| R4 | **Enter übernimmt, Esc verwirft, Tab springt weiter**, überall gleich. Fokus springt nach Übernehmen zurück ins Modell. |
| R5 | **Ein Bedienelement je Art von Wert:** Auswahl aus festen Werten → Auswahlknopf; Ein/Aus → Schalter; Maß → Feld mit Einheit; zwei bis drei kurze Optionen → Segment. Keine Mischformen. |
| R6 | **Jede Änderung hat einen Namen im Rückgängig-Verlauf** („Fenster F-03 verschoben“). |
| R7 | **Maße im Modell sind antippbar** – für alle Bauteile, nicht nur Achsen und Öffnungen. |
| R8 | **Mehrfachauswahl zeigt gemeinsame Werte**, unterschiedliche als „verschieden“; eine Eingabe gilt für alle. |
| R9 | **Tastatur zuerst am Desktop:** jeder Befehl hat ein Kürzel (zweibuchstabig wie in AutoCAD/Revit: WA Wand, ST Stütze, FE Fenster …), Leertaste wiederholt den letzten Befehl, Rechtsklick öffnet ein Kontextmenü. |
| R10 | **Keine verdeckenden Karten auf dem Modell** am Desktop. Was schwebt, ist klein und an seinem Auslöser (Maß-Editor, Auswahlliste). |

---

## 4. Roadmap

Aufwand: S = bis 1 Tag, M = 2–4 Tage, L = 1–2 Wochen (bei der bisherigen Arbeitsweise).

### Phase 0 – Fehler sofort beheben (S–M)

| Nr. | Aufgabe | fertig, wenn |
|---|---|---|
| 0.1 | Zahlen-Leser nach R1 für **alle** Felder, R2 für die Anzeige im Feld | „1.260“, „1260“, „1,26 m“ ergeben 1260; Ändern eines angezeigten Werts ergibt nie Faktor 1000; Prüfliste mit 20 Eingaben im Selbsttest |
| 0.2 | Dialoge Fenster/Dach/Treppe/Rasterdecke an die Auswahl binden (R3), bis Phase 2 sie ersetzt | Fenster A wählen, Editor öffnen, Fenster B wählen → Editor zeigt B; Wand wählen → Editor schließt |
| 0.3 | Stützen an Wandecken und Wandenden: Wände enden stumpf an der Stützenfläche, keine Gehrung im Bereich der Stütze; Kantenlinien aus den ausgesparten Stücken zeichnen | Ecke mit Stütze zeigt in 3D und Grundriss keine Wandlinie innerhalb der Stütze; Mengen und IFC stimmen |
| 0.4 | Alte orange „ab Wandanfang“-Maße bei gewählter Öffnung entfernen | nur noch eine Maßart sichtbar |
| 0.5 | ~~Hinweis „Neue Version“~~ – entfällt, siehe F6 | – |
| 0.6 | Maßketten: Abstand zwischen Ketten benachbarter Gruppen und Zahlen ohne Überdeckung | keine überlappenden Zahlen bei Achsen ≥ 500 mm Abstand |

### Phase 1 – Desktop-Gerüst (L)

| Nr. | Aufgabe |
|---|---|
| 1.1 | Grundlayout nach 2.1: Menüband oben, Projektbrowser links, Eigenschaften rechts, Statusleiste unten; andockbar, einklappbar, Breiten gemerkt |
| 1.2 | Menüband mit Reitern nach 2.2, Symbole einheitlich (gleiche Strichstärke wie heute), große Knöpfe für häufige Befehle, kleine für seltene, Auswahlknöpfe (▾) für Varianten |
| 1.3 | Optionsleiste ersetzt die Befehlsleiste unten; Aufforderung, Koordinaten, Fang, Ortho in die Statusleiste |
| 1.4 | Kontext-Reiter je Bauteilart |
| 1.5 | Bereich „Gebäude“ (ganzseitig) ersetzt Gebäude-Dialog |
| 1.6 | Rechtsklick-Kontextmenü im Modell (Befehle für die Auswahl, Letzten Befehl wiederholen, Auswahl aufheben) |
| 1.7 | Tastaturkürzel nach R9 und eine Übersicht (Taste „?“) |
| 1.8 | iPad: Menüband einzeilig, Paletten als Seitenblätter |

### Phase 2 – Eigenschaften-Palette statt Dialoge (M–L)

| Nr. | Aufgabe |
|---|---|
| 2.1 | Eigenschaften-Palette für jedes Bauteil, gegliedert in aufklappbare Abschnitte (Typ, Lage, Abmessungen, Bezug, Mengen, IFC) |
| 2.2 | Dach, Treppe, Rasterdecke, Unterlage, Geschoss, Achse, Achsgruppe vollständig in die Palette; Dialoge entfallen |
| 2.3 | Fenster-Editor als andockbarer Bereich, an die Auswahl gebunden, für mehrere gleiche Fenster zugleich |
| 2.4 | Mehrfachauswahl nach R8 (gemischte Werte, gemeinsame Eingabe) für alle Bauteilarten |
| 2.5 | Einheitliche Bedienelemente nach R5; Segmentknöpfe nur noch für 2–3 kurze Optionen |

### Phase 3 – Bauteiltypen (L)

| Nr. | Aufgabe |
|---|---|
| 3.1 | Typen-Katalog `B.types`: Wandtypen (Schichten: Putz, Mauerwerk, Dämmung … mit Dicken, Gesamtdicke ergibt sich), Deckentypen, Stützentypen, Fenster- und Türtypen (heutige Vorlagen werden Typen) |
| 3.2 | Exemplar verweist auf Typ, überschreibt nur Abweichungen; „Typ bearbeiten“ ändert alle Exemplare |
| 3.3 | Typauswahl überall gleich: Auswahlknopf mit Vorschau und Suche; „Neuer Typ aus Auswahl“ |
| 3.4 | Schichten im Grundriss (Schraffur je Schicht, abschaltbar) und im IFC (IfcMaterialLayerSet) |
| 3.5 | Typ-Liste im Projektbrowser mit Anzahl der Exemplare |

### Phase 4 – Datenmodell festigen (M–L)

| Nr. | Aufgabe |
|---|---|
| 4.1 | Schemaversion und Migrationen statt stiller Reparatur |
| 4.2 | Gespeicherte Beziehungen: Wandverbindungen (Art: Gehrung, stumpf, durchlaufend, an Stütze), Achsbindung, Wirt; Anzeige als kleines Symbol am Bauteil, lösbar in der Palette |
| 4.3 | Höhen als Bezug + Versatz (R: „OK Rohdecke EG + 900“, „UK Decke darüber − 0“) |
| 4.4 | Räume, Decken- und Dachränder an Wände gebunden: Umriss folgt, wenn Wände sich ändern (F8) |
| 4.5 | Öffnungen mit wählbarem Bezug (Wandanfang, Wandende, Achse, Kante) |
| 4.6 | Rückgängig als benannte Änderungsliste (R6), Verlauf im Menü |
| 4.7 | Geometrie-Zwischenspeicher je Bauteil; Zielwert: Gebäude mit 2.000 Bauteilen dreht flüssig (60 Bilder/s am Mac) |
| 4.8 | `building.js` aufteilen: Daten/Migration, Geometrie, Fang, Darstellung, Oberfläche, IFC, Speicher |

### Phase 5 – Bearbeiten direkt im Modell (M–L)

| Nr. | Aufgabe |
|---|---|
| 5.1 | **Temporäre Maße** für jede Auswahl (wie bei Öffnungen): Wand (Länge, Abstände der Enden zu Nachbarwänden/Achsen), Stütze (Abstände zu den nächsten Achsen oder Wandflächen), Decke (Kantenlängen), Raum |
| 5.2 | Maße **festsetzen** (Schloss am Maß): fester Abstand bleibt beim Verschieben anderer Teile erhalten |
| 5.3 | Griffe einheitlich: Kreis = Punkt ziehen, Quadrat = verschieben, Bogen = drehen; Doppelklick auf Griff = Wert eintippen |
| 5.4 | Rahmenauswahl (links→rechts nur ganz Enthaltenes, rechts→links alles Berührte), Auswahlfilter nach Bauteilart, „Alle dieses Typs wählen“ |
| 5.5 | Flächenfang in 3D auch beim Zeichnen (F7), mit Vorrang-Regel gegenüber Ortho |
| 5.6 | Ausrichten-Befehl: Kante an Kante bündig setzen (wie Revit „Ausrichten“) |
| 5.7 | Spiegeln, Drehen, Reihe (Anzahl und Abstand) als Befehle |

### Phase 6 – Ansicht und Navigation (M)

| Nr. | Aufgabe |
|---|---|
| 6.1 | Navigationswürfel (wie Fusion 360) mit Ansichten oben/vorn/seitlich/iso und Drehen per Klick |
| 6.2 | Schnittbox und Schnittebene (Höhe einstellbar) für 3D |
| 6.3 | Gespeicherte Ansichten im Projektbrowser (Kamera, Geschoss, Layer, Schnitt) |
| 6.4 | Darstellungsstile: schattiert mit Kanten, nur Kanten, durchscheinend; Grundriss mit Schraffuren |
| 6.5 | Statusleiste mit Koordinaten des Zeigers und Maßstab |

### Phase 7 – Ausgabe und Listen (M)

| Nr. | Aufgabe |
|---|---|
| 7.1 | Listen als Tabelle: Fenster/Türen, Räume (Fläche, Umfang, Höhe), Wände je Typ (Länge, Fläche), Stützen; sortier- und filterbar, Klick wählt im Modell |
| 7.2 | Export der Listen als CSV/Excel |
| 7.3 | Grundriss als PDF mit Maßstab, Achsen, Maßketten und Raumstempeln |
| 7.4 | IFC: Typen (IfcWallType …), Schichten, Räume mit Begrenzungen, Geschoss-Höhen |

### Phase 8 – Qualität (laufend)

| Nr. | Aufgabe |
|---|---|
| 8.1 | Selbsttest Gebäude analog zum Rohr-Selbsttest: Zahlen-Leser, Raumerkennung, Wandecken mit Stützen, Achsbindung, Öffnungsmaße, IFC-Bezüge |
| 8.2 | Prüfmodelle (Einfamilienhaus, Bürokomplex, schiefer Plan) als Dateien im Projekt, vor jeder Version einmal laden |
| 8.3 | Leistungsmessung mit großem Modell |

---

## 5. Reihenfolge und Abhängigkeiten

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3
                │            │
                │            └──► Phase 5 (Maße, Griffe)
                └──► Phase 6 (Navigation)
Phase 4 (Datenmodell) läuft neben 2 und 3 mit: 4.1 vor 3.1, 4.2 vor 5.2, 4.8 vor Phase 1
Phase 7 nach 3 (Typen machen Listen sinnvoll)
Phase 8 laufend, 8.1 sofort mit Phase 0
```

Empfehlung für die nächsten Schritte:

1. **Phase 0** komplett (die drei vom Nutzer gemeldeten Fehler zuerst: 0.1, 0.2, 0.3).
2. **4.8** (Datei aufteilen) und **8.1** (Selbsttest), weil Phase 1 die ganze Oberfläche umbaut.
3. **Phase 1** – danach fühlt sich das Werkzeug am Desktop wie eine Profi-Anwendung an.
4. **Phase 2**, dann **Phase 3**.

## 6. Offene Entscheidungen

1. **Menüband oder klassische Menüleiste + Werkzeugkästen?** Empfehlung: Menüband, weil es am iPad ebenfalls trägt und Gruppen sichtbar macht. Klassische Menüs wären am Mac vertrauter, verstecken aber Befehle.
2. **Kürzel einbuchstabig (heute W, S, T …) oder zweibuchstabig?** Zweibuchstabig skaliert auf mehr Befehle; die heutigen Buchstaben könnten als Abkürzung erhalten bleiben.
3. **Wie viel Revit?** Typen und Bindungen (Phase 3/4) sind mächtig, machen das Modell aber auch strenger. Vorschlag: Bindungen immer sichtbar und mit einem Klick lösbar.
4. **Rohrbiege-Assistent:** Soll er später dasselbe Grundlayout bekommen (eigene Reiter „Rohr“, „Biegen“, „Zubehör“ im selben Menüband)? Das ist die Voraussetzung, damit Gebäude und Rohre in einer Oberfläche zusammenwachsen.

## 7. Phase 0 umgesetzt (Version 270)

| Nr. | Ergebnis |
|---|---|
| 0.1 | Ein Zahlen-Leser (`num`) für alle Felder: „1.260“, „1260“, „1 260“, „1.260,5“, „1260,5“, „1,26 m“, „126 cm“, „2*1260+115“, „(1000+260)/2“. Felder zeigen beim Bearbeiten die nackte Zahl („1260“), ein Klick markiert den ganzen Wert. Nicht lesbare Eingabe: alter Wert bleibt, Hinweis mit Beispielen. Geprüft mit 20 Eingaben. |
| 0.2 | Fenster-, Dach-, Treppen- und Rasterdecken-Dialog folgen der Auswahl: anderes Bauteil gleicher Art gewählt → Dialog zeigt es (Felder geprüft), anderes Bauteil → Dialog schließt. |
| 0.3 | Wandkanten (3D und Grundriss) werden dort nicht mehr gezeichnet, wo eine Stütze steht: Gehrung und Stoß verschwinden hinter der Stütze. Geprüft: Wandecke mit Stütze 300 × 300 – vorher 16 Linien innerhalb der Stütze, jetzt 0. |
| 0.4 | Alte Maße „ab Wandanfang“ bei gewählter Öffnung entfernt; neu ist die **Breite** als antippbares Maß (Mitte bleibt). |
| 0.5 | entfällt (F6 war kein App-Fehler). |
| 0.6 | Maßzahlen der Achsketten weichen einander aus (bis zu fünf Plätze), keine Überdeckung mehr. Die Ketten benachbarter Gruppen können sich bei sehr kleinem Abstand noch überlagern. |

Nächste Schritte laut Abschnitt 5: Datei aufteilen (4.8) und Selbsttest Gebäude (8.1), dann Phase 1.

## 8. Version 271/272: Datei aufteilen (4.8, erster Schnitt) und Selbsttest Gebäude (8.1)

- **Aufteilung:** Der zustandslose Teil von `building.js` (rund 430 Zeilen) liegt jetzt in fünf Modulen: `building-math.js` (Vektoren, Polygone, Zahlen), `building-steel.js` (Profile), `building-store.js` (IndexedDB, neues Gebäude), `building-data.js` (Symbole, Vorgaben, Vorlagen), `building-css.js` (Gestaltung). `building.js` behält die Hülle (Oberfläche, Fang, Bearbeiten, IFC) mit 3.150 Zeilen. Die Module stehen in `sw.js` für den Offline-Betrieb.
- **Noch offen in 4.8:** die Hülle selbst ist ein Block, weil Zustand (Gebäude, Auswahl, Kamera) von allen Teilen gemeinsam benutzt wird. Der nächste Schnitt braucht einen expliziten Zustand (`ctx`), den Geometrie, Fang, Darstellung, Oberfläche und IFC bekommen – das gehört zu Phase 4 und sollte vor dem Umbau der Oberfläche (Phase 1) angegangen werden.
- **Selbsttest:** `biegeDebug.bau.selfTest()` (nur im Testmodus) läuft in einem eigenen Test-Gebäude im Speicher; geöffnetes Gebäude, Rückgängig, Auswahl und Datenbank bleiben unberührt (geprüft). Zehn Fälle: Zahlen lesen (20 Eingaben), Achsabstände lesen, Raum aus vier Wänden, Wandecke mit Stütze (keine Linie in der Stütze), Stütze in der Wand (Wandkörper ausgespart), Raum zwischen Stützen und Wänden, Achsgruppen links/rechts, Achse verschieben (Stütze und Wand folgen, gelöste Stütze nicht), Fenstermaße (links + Breite + rechts = Wandlänge), IFC-Bezüge. Stand: 10 von 10 bestanden.

## 9. Phase 1 erster Stand (Version 273)

Ab **1000 px Breite** (Desktop, iPad quer) gilt das neue Gerüst, darunter bleibt die bisherige Oberfläche mit schwebenden Leisten (iPad hochkant, Telefon).

| Nr. | Stand |
|---|---|
| 1.1 | **Fertig:** Kopfzeile (Projektbrowser, Gebäude, Rückgängig/Wiederholen, Geschoss, Fertig), darunter Menüband, Optionsleiste, links Projektbrowser (angedockt, ein-/ausklappbar), Zeichenfläche, rechts Eigenschaften (angedockt, immer sichtbar, ohne Auswahl Geschossübersicht), unten Statusleiste. Nichts schwebt mehr über dem Modell; Einpassen rechnet mit der freien Fläche. *Offen:* Breiten der Paletten per Ziehen verstellbar (feste 280/330 px). |
| 1.2 | **Fertig:** Menüband mit 8 Reitern (Gebäude, Start, Tragwerk, Öffnungen, Ausbau, Raster + Plan, Messen, Ansicht), Gruppen mit Beschriftung, große Symbolknöpfe, aktiver Befehl hervorgehoben, Knöpfe ohne Auswahl bzw. ohne Planunterlage ausgegraut, Doppelklick auf den Reiter klappt das Band ein. 20 neue Symbole. |
| 1.3 | **Fertig:** Optionsleiste unter dem Band ersetzt die Befehlsleiste (erscheint nur, solange ein Befehl läuft; Listen öffnen nach unten); Statusleiste mit Aufforderung bzw. Auswahl, Zeigerkoordinaten in mm, Ortho-Schalter, Fang-Menü. |
| 1.4 | **Fertig (erste Fassung):** Kontext-Reiter rechts im Band (farbig) bei Auswahl: Wand (Teilen, Wandzug, Ecken verbinden), Fenster (Gestalten), Treppe, Dach, Rasterdecke (Raster, Rasterstart, Platten), Raum (Rasterdecke), Achse (Parallele, Neu nummerieren) plus Ändern/Auswahl. Fällt bei leerer Auswahl auf den vorigen Reiter zurück. |
| 1.5 | *Offen:* ganzseitiger Bereich „Gebäude“; Reiter „Gebäude“ im Band deckt Neu/Öffnen/Sichern/Laden/IFC/Bild ab, der Dialog „Gebäude“ bleibt für die Liste. |
| 1.6 | **Fertig:** Rechtsklick-Menü (Letzten Befehl wiederholen, Verschieben, Kopieren, Ausblenden, Löschen, Auswahl aufheben, Zoom, Grundriss/3D; bei laufendem Befehl Beenden, Ortho). Ziehen mit der rechten Taste verschiebt weiter. |
| 1.7 | **Teilweise:** Übersicht „?“ (Taste ? oder Knopf in der Statusleiste), Leertaste wiederholt den letzten Befehl. *Offen:* zweibuchstabige Kürzel. |
| 1.8 | *Offen:* iPad-Menüband (einzeilig mit Seitenblättern); iPad quer nutzt schon das Desktop-Gerüst. |

Getestet in 1500 × 900 und 820 × 900: Umschalten in beide Richtungen (Optionsleiste wandert zwischen Band und unterer Leiste), Reiter, Befehlsstart per Band mit Hervorhebung, Auswahllisten nach unten, Fang-Menü aus der Statusleiste, Kontext-Reiter und Rückfall, Eigenschaften-Palette mit Feldern (Breite „1.200“ → 1200), Dialog neben der Palette, Rechtsklick-Menü, Koordinaten, Leertaste, ?-Übersicht. Selbsttest Gebäude 10/10, Rohr 9/9, keine Konsolenfehler.
