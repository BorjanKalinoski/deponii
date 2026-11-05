# Депонии во Македонија

A public, browse-only map and list of recorded wild landfills across Macedonia, fed from an inventory the owner keeps in a Google Sheet.

The country is called **Macedonia** (Македонија) in every language of the site. _Avoid_: North Macedonia

## Records and places

**Recorded site**:
One row of the inventory, describing one landfill as the source recorded it. Not a confirmed, inspected or distinct physical location.
_Avoid_: Landfill (as a count), confirmed site, location, entry

**Located record**:
A recorded site that has a coordinate pair in the source.
_Avoid_: Mapped site, geocoded site

**Unlocated record**:
A recorded site with no coordinate pair. It appears in the list and details, never as a marker, and is never given a substitute position.
_Avoid_: Missing site, hidden site

**Approximate coordinate**:
A coordinate the source itself marks as approximate. Every other coordinate is still only as recorded, never independently verified.
_Avoid_: Verified coordinate, exact location

**Location note**:
The source's public comment on a record (column "Коментар"), shown as written; it is where the source marks a coordinate as approximate or unknown.
_Avoid_: Comment, remark

**Coincident records**:
Two or more distinct recorded sites that share the same coordinate pair. They stay separate records.
_Avoid_: Duplicates

**Region**:
One of the eight regions named in the source inventory. "Скопски" is a region, not the city of Skopje.
_Avoid_: Area, district

**Municipality**:
The municipality named in the source, including all its villages.
_Avoid_: City, opština

**Settlement**:
The populated place the source names for a recorded site.
_Avoid_: Village, town

**Locality**:
The more specific named spot within or near a settlement, as the source records it.
_Avoid_: Address, place

## Measurements and classification

**Recorded area**:
The site area in m² as stated in the source; may be unknown, never zero by default.
_Avoid_: Size, footprint

**Recorded volume**:
The site volume as stated in the source; may be unknown, never zero by default.

**Landfill type**:
The source's classification of the site: Буниште, Активна нестандардна or Затворена нестандардна. Independent of what waste it holds.
_Avoid_: Category, status

**Dominant-waste description**:
The source's free-text wording of the main waste at a site, kept exactly as written.
_Avoid_: Waste type

**Waste material**:
A normalised material the visitor can filter by, derived only from what a dominant-waste description explicitly states.
_Avoid_: Waste type, waste category

**Mixed waste**:
A dominant-waste description that names two or more waste materials, or calls itself mixed ("Мешан комунален"). Word order does not matter.
_Avoid_: Combined, multiple

**Unknown waste**:
The state of a recorded site whose dominant-waste description is absent.

## Data freshness

**Information date**:
The date the source attaches to a record's information. It says nothing about present-day inspection or conditions.
_Avoid_: Last updated, inspection date

**Last data update**:
The time the website last successfully read a valid copy of the inventory.
_Avoid_: Information date

**Snapshot**:
The verified starting copy of the inventory bundled with the site, labelled as such until a live connection is proven.

**Map data tab**:
The dedicated tab of the owner's workbook that holds only the publishable fields; the only part of the workbook that is public.
_Avoid_: Public sheet, export
