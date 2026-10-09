#!/usr/bin/env python3
# Usage: python3 scripts/data/make-demo-darwin.py src/lib/data/demo-darwin.json   (then: npm run validate src/lib/data/demo-darwin.json)
# Builds src/lib/data/demo-darwin.json: the Darwin–Wedgwood demo family (E4).
# Facts from Wikipedia (Erasmus Darwin, Darwin–Wedgwood family, Josiah Wedgwood, Robert Darwin, Emma Darwin,
# George/Francis/Leonard/Horace Darwin, Anne Darwin, Caroline Wedgwood), the Darwin Correspondence Project name
# registers and thepeerage.com. Where sources disagree or are thin, the fact is marked likely / guess / conflicting.
import json, sys

places = {
    'elston': ('Elston', 'Nottinghamshire, England', 53.0335, -0.8713),
    'breadsall': ('Breadsall', 'Derbyshire, England', 52.9530, -1.4450),
    'lichfield': ('Lichfield', 'Staffordshire, England', 52.6816, -1.8317),
    'shrewsbury': ('Shrewsbury', 'Shropshire, England', 52.7073, -2.7553),
    'downe': ('Downe', 'Kent, England', 51.3355, 0.0527),
    'maer': ('Maer', 'Staffordshire, England', 52.9446, -2.3184),
    'burslem': ('Burslem', 'Staffordshire, England', 53.0436, -2.1965),
    'etruria': ('Etruria', 'Stoke-on-Trent, Staffordshire, England', 53.0285, -2.1984),
    'astbury': ('Astbury', 'Cheshire, England', 53.1556, -2.2082),
    'marylebone': ('St Marylebone', 'London, England', 51.5225, -0.1557),
    'malvern': ('Great Malvern', 'Worcestershire, England', 52.1113, -2.3253),
    'cambridge': ('Cambridge', 'Cambridgeshire, England', 52.2053, 0.1218),
    'edinburgh': ('Edinburgh', 'Scotland', 55.9533, -3.1883),
    'derby': ('Derby', 'Derbyshire, England', 52.9225, -1.4746),
    'radbourne': ('Radbourne', 'Derbyshire, England', 52.9036, -1.5650),
    'birmingham': ('Birmingham', 'Warwickshire, England', 52.4862, -1.8904),
    'forestrow': ('Forest Row', 'East Sussex, England', 51.0960, 0.0330),
    'ypres': ('Ypres', 'West Flanders, Belgium', 50.8503, 2.8853),
    'downampney': ('Down Ampney', 'Gloucestershire, England', 51.6726, -1.8441),
    'london': ('London', 'England', 51.5072, -0.1276),
    'haslemere': ('Haslemere', 'Surrey, England', 51.0903, -0.7130),
    'sedbergh': ('Sedbergh', 'Cumbria, England', 54.3237, -2.5280),
}

people, families, events = [], [], []

WIKI = 'https://en.wikipedia.org/wiki/'
FAMILY = ('Wikipedia: Darwin–Wedgwood family', WIKI + 'Darwin%E2%80%93Wedgwood_family')
SOURCES = {  # person → the pages their facts came from (everyone else: the Darwin–Wedgwood family article)
    'erasmus': [('Wikipedia: Erasmus Darwin', WIKI + 'Erasmus_Darwin')],
    'mary_howard': [('Wikipedia: Erasmus Darwin', WIKI + 'Erasmus_Darwin')],
    'charles_1758': [('Wikipedia: Erasmus Darwin', WIKI + 'Erasmus_Darwin')],
    'erasmus_jr': [('Darwin Correspondence Project: Erasmus Darwin (1759–99)', 'https://epsilon.ac.uk/view/dcp-data/nameregs/nameregs_8435')],
    'elizabeth_1763': [('Wikipedia: Erasmus Darwin', WIKI + 'Erasmus_Darwin')],
    'william_alvey': [('Wikipedia: Erasmus Darwin', WIKI + 'Erasmus_Darwin')],
    'robert': [('Wikipedia: Robert Darwin', WIKI + 'Robert_Darwin')],
    'mary_parker': [('Wikipedia: Erasmus Darwin', WIKI + 'Erasmus_Darwin')],
    'joseph_day': [('Wikipedia: Erasmus Darwin', WIKI + 'Erasmus_Darwin')],
    'susanna_parker': [('Romantic Circles: Darwin on female education', 'https://romantic-circles.org/sites/default/files/imported/editions/loves-plants/3.02.%20Education.pdf'),
                       ('Wikipedia: Erasmus Darwin', WIKI + 'Erasmus_Darwin')],
    'mary_parker_jr': [('Wikipedia: Erasmus Darwin', WIKI + 'Erasmus_Darwin')],
    'henry_hadley': [('Romantic Circles: Darwin on female education', 'https://romantic-circles.org/sites/default/files/imported/editions/loves-plants/3.02.%20Education.pdf')],
    'earl_portmore': [('Wikipedia: Charles Colyear, 2nd Earl of Portmore', WIKI + 'Charles_Colyear,_2nd_Earl_of_Portmore')],
    'elizabeth_collier_sr': [('Wikipedia: Charles Colyear, 2nd Earl of Portmore', WIKI + 'Charles_Colyear,_2nd_Earl_of_Portmore')],
    'elizabeth_collier': [('Wikipedia: Elizabeth Darwin', WIKI + 'Elizabeth_Darwin'),
                          ('Wikipedia: Charles Colyear, 2nd Earl of Portmore', WIKI + 'Charles_Colyear,_2nd_Earl_of_Portmore'),
                          ('Revolutionary Players: Elizabeth Pole', 'https://revolutionaryplayers.org.uk/?p=3626')],
    'col_pole': [('Wikipedia: Charles Colyear, 2nd Earl of Portmore', WIKI + 'Charles_Colyear,_2nd_Earl_of_Portmore')],
    'sacheverell_pole': [('Revolutionary Players: Elizabeth Pole', 'https://revolutionaryplayers.org.uk/?p=3626')],
    'violetta': [('Darwin Correspondence Project: Violetta Darwin', 'https://epsilon.ac.uk/view/dcp-data/nameregs/nameregs_1796'),
                 ('thepeerage.com: Frances Anne Violetta Darwin', 'https://thepeerage.com/p34718.htm')],
    'tertius_galton': [('Wikipedia: Samuel Tertius Galton', WIKI + 'Samuel_Tertius_Galton')],
    'francis_galton': [('Wikipedia: Francis Galton', WIKI + 'Francis_Galton')],
    'josiah_1': [('Wikipedia: Josiah Wedgwood', WIKI + 'Josiah_Wedgwood')],
    'sarah_wedgwood': [('Wikipedia: Josiah Wedgwood', WIKI + 'Josiah_Wedgwood')],
    'josiah_2': [('Wikipedia: Josiah Wedgwood II', WIKI + 'Josiah_Wedgwood_II')],
    'josiah_3': [('Darwin Correspondence Project: Josiah Wedgwood III', 'https://epsilon.ac.uk/view/dcp-data/nameregs/nameregs_5027')],
    'caroline': [('Wikipedia: Caroline Wedgwood', WIKI + 'Caroline_Wedgwood'), ('thepeerage.com: Caroline Sarah Darwin', 'https://thepeerage.com/p53229.htm')],
    'sophy_1838': [('Wikipedia: Caroline Wedgwood', WIKI + 'Caroline_Wedgwood')],
    'sophy_1842': [('Wikipedia: Caroline Wedgwood', WIKI + 'Caroline_Wedgwood'), ('thepeerage.com: Caroline Sarah Darwin', 'https://thepeerage.com/p53229.htm')],
    'margaret_wedgwood': [('Wikipedia: Caroline Wedgwood', WIKI + 'Caroline_Wedgwood')],
    'lucy_wedgwood': [('thepeerage.com: Caroline Sarah Darwin', 'https://thepeerage.com/p53229.htm')],
    'charles_langton': [('Darwin Correspondence Project: Charles Langton', 'https://epsilon.ac.uk/view/dcp-data/nameregs/nameregs_2809')],
    'arthur_vw': [('Wikipedia: Ralph Vaughan Williams', WIKI + 'Ralph_Vaughan_Williams')],
    'ralph_vw': [('Wikipedia: Ralph Vaughan Williams', WIKI + 'Ralph_Vaughan_Williams')],
    'charles': [('Wikipedia: Charles Darwin', WIKI + 'Charles_Darwin')],
    'emma': [('Wikipedia: Emma Darwin', WIKI + 'Emma_Darwin')],
    'william': [('Wikipedia: William Erasmus Darwin', WIKI + 'William_Erasmus_Darwin')],
    'sara_sedgwick': [('Wikipedia: William Erasmus Darwin', WIKI + 'William_Erasmus_Darwin')],
    'annie': [('Wikipedia: Anne Darwin', WIKI + 'Anne_Darwin')],
    'mary_eleanor': [('Find a Grave: Mary Eleanor Darwin', 'https://www.findagrave.com/memorial/91914049/mary-eleanor-darwin')],
    'george': [('Wikipedia: George Darwin', WIKI + 'George_Darwin')],
    'maud': [('Wikipedia: George Darwin', WIKI + 'George_Darwin')],
    'francis': [('Wikipedia: Francis Darwin', WIKI + 'Francis_Darwin')],
    'amy_ruck': [('Wikipedia: Francis Darwin', WIKI + 'Francis_Darwin')],
    'ellen_crofts': [('Wikipedia: Francis Darwin', WIKI + 'Francis_Darwin')],
    'florence_fisher': [('Wikipedia: Francis Darwin', WIKI + 'Francis_Darwin'), ('Wikipedia: Frederic William Maitland', WIKI + 'Frederic_William_Maitland')],
    'maitland': [('Wikipedia: Frederic William Maitland', WIKI + 'Frederic_William_Maitland')],
    'ermengard': [('Wikipedia: Frederic William Maitland', WIKI + 'Frederic_William_Maitland')],
    'fredegond': [('Wikipedia: Frederic William Maitland', WIKI + 'Frederic_William_Maitland')],
    'leonard': [('Wikipedia: Leonard Darwin', WIKI + 'Leonard_Darwin')],
    'elizabeth_fraser': [('Wikipedia: Leonard Darwin', WIKI + 'Leonard_Darwin')],
    'mildred_massingberd': [('Wikipedia: Leonard Darwin', WIKI + 'Leonard_Darwin')],
    'horace': [('Wikipedia: Horace Darwin', WIKI + 'Horace_Darwin')],
    'ida_farrer': [('Wikipedia: Horace Darwin', WIKI + 'Horace_Darwin')],
    'erasmus_iv': [('Wikipedia: Horace Darwin', WIKI + 'Horace_Darwin')],
    'ruth': [('Wikipedia: Horace Darwin', WIKI + 'Horace_Darwin')],
    'nora': [('Wikipedia: Horace Darwin', WIKI + 'Horace_Darwin')],
    'charles_waring': [('Darwin Correspondence Project: letter to W. D. Fox, 1858', 'https://www.darwinproject.ac.uk/letter/DCP-LETT-2300.xml')],
    'gwen': [('Wikipedia: Gwen Raverat', WIKI + 'Gwen_Raverat')],
    'jacques_raverat': [('Wikipedia: Gwen Raverat', WIKI + 'Gwen_Raverat')],
    'geoffrey_keynes': [('Wikipedia: Geoffrey Keynes', WIKI + 'Geoffrey_Keynes')],
    'margaret_darwin': [('Wikipedia: Geoffrey Keynes', WIKI + 'Geoffrey_Keynes'), FAMILY],
    'frances': [('Wikipedia: Frances Cornford', WIKI + 'Frances_Cornford')],
    'francis_cornford': [('Wikipedia: Frances Cornford', WIKI + 'Frances_Cornford')],
}


def date(v):
    """'1858' → confirmed; ('1858', 'likely') → that status."""
    if v is None:
        return None
    e, s = (v, 'confirmed') if isinstance(v, str) else v
    return {'edtf': e, 'status': s}


def P(pid, given, surname, sex, born=None, died=None, bplace=None, dplace=None, deceased=True, knownAs=None,
      married=None, notes=None, src=None, tags=None, stage=None, todo=None, name_status='confirmed', placeholder=False):
    p = {'id': 'per_' + pid, 'names': [{'type': 'birth', 'given': given, 'surname': surname, 'status': name_status}],
         'sex': {'value': sex, 'status': 'confirmed'}}
    if placeholder:
        p['placeholder'] = True
        p['names'] = [{'type': 'birth', 'given': given, 'surname': surname, 'status': 'guess'}] if given or surname else []
    if married:
        p['names'].append({'type': 'married', 'given': given, 'surname': married, 'status': 'confirmed'})
    if knownAs:
        p['knownAs'] = knownAs
    if deceased:
        p['deceased'] = True
    if tags:
        p['tags'] = tags
    if notes:
        p['notes'] = notes
    if src:
        p['sourceNotes'] = src
    urls = SOURCES.get(pid, [FAMILY])
    p['links'] = {'urls': [{'url': u, 'label': l} for l, u in urls]}
    if stage or todo:
        p['research'] = {k: v for k, v in (('stage', stage), ('todo', todo)) if v}
    people.append(p)
    for kind, d, pl in (('birth', born, bplace), ('death', died, dplace)):
        if d is None and pl is None:
            continue
        ev = {'id': f'evt_{kind}_{pid}', 'type': kind}
        if d is not None:
            ev['date'] = date(d)
        if pl:
            pl, ps = (pl, 'confirmed') if isinstance(pl, str) else pl
            ev['place'] = {'placeId': 'plc_' + pl, 'status': ps}
        ev['participants'] = [{'personId': 'per_' + pid}]
        events.append(ev)


def F(fid, a, b, kids=(), start=None, end=None, endReason=None, rtype='marriage', rstatus='confirmed', complete='yes',
      expected=None, note=None, kid_status=None, place=None, relation=None):
    f = {'id': 'fam_' + fid, 'partners': [{'personId': 'per_' + x, 'status': 'confirmed'} for x in (a, b) if x]}
    if rtype:
        r = {'type': rtype, 'status': rstatus}
        if start:
            r['start'] = date(start)
        if end:
            r['end'] = date(end)
        if endReason:
            r['endReason'] = endReason
        f['relationship'] = r
    f['children'] = [{'personId': 'per_' + k, 'relation': (relation or {}).get(k, 'biological'),
                      'status': (kid_status or {}).get(k, 'confirmed')} for k in kids]
    f['childrenComplete'] = complete
    if expected:
        f['expectedChildren'] = {'min': expected[0], 'note': expected[1]} if isinstance(expected, tuple) else {'min': expected}
    if note:
        f['notes'] = note
    families.append(f)
    if place:  # marriage place as a marriage event (unused: the UI and map only show births and deaths for now)
        pl, ps = (place, 'confirmed') if isinstance(place, str) else place
        ev = {'id': f'evt_marriage_{fid}', 'type': 'marriage', 'familyId': 'fam_' + fid}
        if start:
            ev['date'] = date(start)
        ev['place'] = {'placeId': 'plc_' + pl, 'status': ps}
        ev['participants'] = [{'personId': 'per_' + x} for x in (a, b) if x]
        events.append(ev)


D, W = ['darwin'], ['wedgwood']
WP = 'Wikipedia: '

# ---- Erasmus Darwin and his three families ----
P('erasmus', 'Erasmus', 'Darwin', 'M', '1731-12-12', '1802-04-18', 'elston', 'breadsall', tags=D, stage='researched',
  notes='Physician, poet and inventor; a founder of the Lunar Society of Birmingham. Grandfather of both Charles Darwin and Francis Galton.',
  src=WP + 'Erasmus Darwin')
P('mary_howard', 'Mary', 'Howard', 'F', '1740', '1770', knownAs='Polly Howard', married='Darwin', tags=D, stage='in-progress',
  notes='Daughter of Charles Howard, a Lichfield solicitor.', src=WP + 'Erasmus Darwin', todo=['Find exact marriage date (1757)'])
P('charles_1758', 'Charles', 'Darwin', 'M', '1758', '1778', dplace=('edinburgh', 'likely'), tags=D, stage='sketch',
  notes='Medical student; died young, of an infection caught while dissecting.', src=WP + 'Erasmus Darwin')
P('erasmus_jr', 'Erasmus', 'Darwin', 'M', '1759', '1799', dplace=('breadsall', 'likely'), tags=D, stage='sketch',
  notes='Lawyer. Bought Breadsall Priory, and drowned in the river at the bottom of its garden; much of the family thought it suicide.',
  src='Darwin Correspondence Project name register', todo=['Check the place of death'])
P('elizabeth_1763', 'Elizabeth', 'Darwin', 'F', '1763', '1763', tags=D, stage='sketch', notes='Died at about four months old.')
P('robert', 'Robert Waring', 'Darwin', 'M', '1766-05-30', '1848-11-13', 'lichfield', 'shrewsbury', tags=D, stage='researched',
  notes='Physician in Shrewsbury; lived at The Mount. Father of Charles Darwin.', src=WP + 'Robert Darwin')
P('william_alvey', 'William Alvey', 'Darwin', 'M', '1767', '1767', tags=D, stage='sketch', notes='Died at 19 days old.')
F('erasmus_howard', 'erasmus', 'mary_howard', ['charles_1758', 'erasmus_jr', 'elizabeth_1763', 'robert', 'william_alvey'],
  start='1757', end='1770', endReason='death')

P('mary_parker', 'Mary', 'Parker', 'F', married='Day', tags=D, stage='sketch',
  notes="Governess hired to look after the young Robert. She and Erasmus had two daughters; she later married Joseph Day.",
  todo=["Find Mary Parker's birth and death dates"], src=WP + 'Erasmus Darwin')
P('susanna_parker', 'Susanna', 'Parker', 'F', '1772', '1856', tags=D, stage='sketch',
  married='Hadley', notes='With her sister Mary, ran a girls’ boarding school at Ashbourne from 1794, for which Erasmus wrote his Plan for the Conduct of Female Education (1797). Some sources call her Susan.')
P('henry_hadley', 'Henry', 'Hadley', 'M', stage='sketch', todo=['Find dates'])
F('hadley_parker', 'henry_hadley', 'susanna_parker', [], start='1809', complete='unknown')
P('mary_parker_jr', 'Mary', 'Parker', 'F', '1774', '1859', tags=D, stage='sketch')
F('erasmus_parker', 'erasmus', 'mary_parker', ['susanna_parker', 'mary_parker_jr'], rtype='partnership', start=('1771', 'likely'),
  note='Not married. The daughters took their mother’s surname.')
P('joseph_day', 'Joseph', 'Day', 'M', '1745', '1811', stage='sketch', notes='Birmingham merchant.')
F('day_parker', 'joseph_day', 'mary_parker', [], start='1782', end=('1811', 'likely'), endReason='death', complete='unknown')

P('earl_portmore', 'Charles', 'Colyear', 'M', '1700-08-27', '1785-07-05', knownAs='2nd Earl of Portmore', stage='sketch',
  src=WP + 'Charles Colyear, 2nd Earl of Portmore')
P('elizabeth_collier_sr', 'Elizabeth', 'Collier', 'F', stage='sketch', todo=['Find dates'])
P('elizabeth_collier', 'Elizabeth', 'Collier', 'F', ('1747', 'likely'), ('1832-02-05', 'likely'), dplace=('breadsall', 'guess'),
  knownAs='Elizabeth Pole', married='Darwin', tags=D, stage='in-progress',
  notes="Widow of Colonel Pole when she married Erasmus. The illegitimate daughter of the 2nd Earl of Portmore.",
  src='thepeerage.com; Find a Grave (death 5 Feb 1832, marriage 6 Mar 1781)', todo=['Find where she died'])
F('portmore', 'earl_portmore', 'elizabeth_collier_sr', ['elizabeth_collier'], rtype='partnership', complete='unknown',
  kid_status={'elizabeth_collier': 'likely'}, note='Not married. Their daughter took her mother’s name.')
P('col_pole', 'Edward Sacheverell', 'Chandos Pole', 'M', '1718', ('1780-11-27', 'likely'), knownAs='Colonel Pole', stage='sketch',
  notes='Of Radbourne Hall, Derbyshire.')
P('sacheverell_pole', 'Sacheverell', 'Chandos Pole', 'M', tags=['pole'], stage='sketch', todo=['Find dates'])
F('pole_collier', 'col_pole', 'elizabeth_collier', ['sacheverell_pole'], end=('1780-11-27', 'likely'), endReason='death',
  complete='no', expected=(3, 'Sources say she had three children by Colonel Pole; only Sacheverell is named here.'))

F('erasmus_collier', 'erasmus', 'elizabeth_collier',
  ['edward', 'violetta', 'emma_1784', 'francis_sacheverel', 'john_1787', 'henry_1789', 'harriet'],
  start=('1781-03-06', 'likely'), end='1802-04-18', endReason='death',
  note='Married at Radbourne, Derbyshire (one local history).')
P('edward', 'Edward', 'Darwin', 'M', '1782', '1829', tags=D, stage='sketch')
P('violetta', 'Frances Anne Violetta', 'Darwin', 'F', '1783', '1874', knownAs='Violetta Darwin', married='Galton', tags=D, stage='sketch',
  notes='Mother of Francis Galton.')
P('emma_1784', 'Emma Georgina Elizabeth', 'Darwin', 'F', '1784', '1818', tags=D, stage='sketch')
P('francis_sacheverel', 'Francis Sacheverel', 'Darwin', 'M', '1786', '1859', knownAs='Sir Francis Darwin', tags=D, stage='sketch',
  notes='Physician and traveller; knighted.')
P('john_1787', 'John', 'Darwin', 'M', '1787', '1818', knownAs='Revd John Darwin', tags=D, stage='sketch')
P('henry_1789', 'Henry', 'Darwin', 'M', '1789', '1790', tags=D, stage='sketch', notes='Died in infancy.')
P('harriet', 'Harriet', 'Darwin', 'F', '1790', '1825', tags=D, stage='sketch')

P('tertius_galton', 'Samuel Tertius', 'Galton', 'M', '1783', '1844', tags=['galton'], stage='sketch', notes='Birmingham banker.')
P('francis_galton', 'Francis', 'Galton', 'M', '1822-02-16', '1911-01-17', 'birmingham', 'haslemere', tags=['galton'], stage='in-progress',
  notes='Statistician and polymath; half-cousin of Charles Darwin.',
  todo=['Add his older brothers and sisters (seven or nine children in all?)'])
F('galton_darwin', 'tertius_galton', 'violetta', ['francis_galton'], start=('1807-03-30', 'likely'), complete='no',
  expected=(7, 'Wikipedia lists seven children, thepeerage.com nine. Francis was the youngest.'))

# ---- The Wedgwoods ----
P('josiah_1', 'Josiah', 'Wedgwood', 'M', '1730-07-12', '1795-01-03', 'burslem', 'etruria', tags=W, stage='researched',
  notes='Potter; founder of the Wedgwood firm, built the Etruria works. Friend of Erasmus Darwin in the Lunar Society.',
  src=WP + 'Josiah Wedgwood (birth date is his baptism, probably the day he was born)')
P('sarah_wedgwood', 'Sarah', 'Wedgwood', 'F', '1734', '1815', tags=W, stage='sketch', notes='A distant cousin of Josiah.')
F('wedgwood_1', 'josiah_1', 'sarah_wedgwood',
  ['susannah', 'john_wedgwood', 'richard_wedgwood', 'josiah_2', 'tom_wedgwood', 'catherine_wedgwood', 'sarah_jr', 'mary_anne_wedgwood'],
  start='1764-01-25', end='1795-01-03', endReason='death',
  note='Married at Astbury, Cheshire.')
P('susannah', 'Susannah', 'Wedgwood', 'F', '1765-01-03', '1817', married='Darwin', tags=W + D, stage='in-progress',
  todo=['Find exact date of death (July 1817?)'])
P('john_wedgwood', 'John', 'Wedgwood', 'M', '1766', '1844', tags=W, stage='sketch', notes='Founder of the Royal Horticultural Society.')
P('richard_wedgwood', 'Richard', 'Wedgwood', 'M', '1767', '1768', tags=W, stage='sketch')
P('josiah_2', 'Josiah', 'Wedgwood', 'M', '1769-04-03', '1843-07-12', dplace=('maer', 'likely'), knownAs='Josiah Wedgwood II', tags=W,
  stage='in-progress', notes='Ran the pottery after his father. Bought Maer Hall in 1807; known in the family as "Uncle Jos".',
  src=WP + 'Josiah Wedgwood II')
P('tom_wedgwood', 'Thomas', 'Wedgwood', 'M', '1771', '1805', tags=W, stage='sketch', notes='Early experimenter in photography.')
P('catherine_wedgwood', 'Catherine', 'Wedgwood', 'F', '1774', '1823', tags=W, stage='sketch')
P('sarah_jr', 'Sarah', 'Wedgwood', 'F', '1776', '1856', tags=W, stage='sketch')
P('mary_anne_wedgwood', 'Mary Anne', 'Wedgwood', 'F', '1778', '1786', tags=W, stage='sketch')

P('bessy_allen', 'Elizabeth', 'Allen', 'F', '1764', '1846', knownAs='Bessy Allen', married='Wedgwood', tags=W, stage='sketch',
  todo=['Find marriage date (1792?)'])
F('wedgwood_2', 'josiah_2', 'bessy_allen',
  ['sarah_e', 'josiah_3', 'mary_ann_1796', 'charlotte', 'henry_allen', 'frank_wedgwood', 'hensleigh', 'fanny', 'emma'],
  start=('1792', 'likely'), end='1843-07-12', endReason='death')
P('sarah_e', 'Sarah Elizabeth', 'Wedgwood', 'F', '1793', '1880', tags=W, stage='sketch')
P('josiah_3', 'Josiah', 'Wedgwood', 'M', '1795', '1880', knownAs='Josiah Wedgwood III', tags=W, stage='sketch',
  notes='Moved the family to Leith Hill Place, Surrey, in 1847.')
P('mary_ann_1796', 'Mary Ann', 'Wedgwood', 'F', '1796', '1798', tags=W, stage='sketch')
P('charlotte', 'Charlotte', 'Wedgwood', 'F', '1797', '1862', married='Langton', tags=W, stage='sketch')
P('henry_allen', 'Henry Allen', 'Wedgwood', 'M', '1799', '1885', tags=W, stage='sketch')
P('frank_wedgwood', 'Francis', 'Wedgwood', 'M', '1800', '1888', tags=W, stage='sketch')
P('hensleigh', 'Hensleigh', 'Wedgwood', 'M', '1803', '1891', tags=W, stage='sketch', notes='Philologist.')
P('fanny', 'Frances', 'Wedgwood', 'F', '1806', '1832', knownAs='Fanny Wedgwood', tags=W, stage='sketch')
P('emma', 'Emma', 'Wedgwood', 'F', '1808-05-02', '1896-10-02', 'maer', 'downe', married='Darwin', tags=W + D, stage='researched',
  notes="Charles Darwin's first cousin and wife. A good pianist; family accounts say she had two or three lessons from Chopin.",
  src=WP + 'Emma Darwin')

# ---- Robert Darwin's family ----
F('darwin_wedgwood', 'robert', 'susannah', ['marianne', 'caroline', 'susan', 'erasmus_alvey', 'charles', 'catherine'],
  start='1796-04-18', end='1817', endReason='death',
  note='Married at St Marylebone, London.')
P('marianne', 'Marianne', 'Darwin', 'F', '1798', '1858', married='Parker', tags=D, stage='sketch')
P('henry_parker', 'Henry', 'Parker', 'M', stage='sketch', notes='Physician.', todo=['Find dates', 'Add their children'])
F('parker_darwin', 'henry_parker', 'marianne', [], start='1824', complete='unknown')
P('caroline', 'Caroline Sarah', 'Darwin', 'F', ('1800', 'conflicting'), '1888', married='Wedgwood', tags=D + W, stage='in-progress',
  notes='Married her cousin Josiah Wedgwood III.', src='Wikipedia gives 1800; thepeerage.com 1801.',
  todo=['Settle her year of birth: 1800 or 1801?'])
P('susan', 'Susan Elizabeth', 'Darwin', 'F', '1803', '1866', tags=D, stage='sketch')
P('erasmus_alvey', 'Erasmus Alvey', 'Darwin', 'M', '1804', '1881', tags=D, stage='sketch', notes="Charles's elder brother; lived in London.")
P('charles', 'Charles Robert', 'Darwin', 'M', '1809-02-12', '1882-04-19', 'shrewsbury', 'downe', knownAs='Charles Darwin', tags=D,
  stage='researched', notes='Naturalist. Sailed on HMS Beagle 1831–36; published On the Origin of Species in 1859. Lived at Down House, Kent, from 1842.')
P('catherine', 'Emily Catherine', 'Darwin', 'F', '1810', ('1866-02-02', 'likely'), knownAs='Catherine Darwin', married='Langton',
  tags=D, stage='sketch')
P('charles_langton', 'Charles', 'Langton', 'M', '1801', '1886', stage='sketch', notes='Clergyman. Married two of the cousins in turn.',
  src='Darwin Correspondence Project name register')
F('langton_wedgwood', 'charles_langton', 'charlotte', [], start='1832-03-22', end='1862', endReason='death', complete='unknown',
  note='Married at Maer.')
F('langton_darwin', 'charles_langton', 'catherine', [], start=('1863-10-12', 'likely'), end=('1866-02-02', 'likely'), endReason='death')

F('wedgwood_3', 'josiah_3', 'caroline', ['sophy_1838', 'sophy_1842', 'margaret_wedgwood', 'lucy_wedgwood'],
  start='1837-08-01', kid_status={'sophy_1842': 'likely'})
P('sophy_1838', 'Sophy Marianne', 'Wedgwood', 'F', '1838-12', '1839-01', tags=W, stage='sketch', notes='Died as a baby.')
P('sophy_1842', 'Katherine Elizabeth Sophy', 'Wedgwood', 'F', ('1842', 'likely'), knownAs='Sophy Wedgwood', tags=W, stage='sketch',
  src='Wikipedia and thepeerage.com differ on her name.', todo=['Find her death date'])
P('margaret_wedgwood', 'Margaret Susan', 'Wedgwood', 'F', '1843', '1937', married='Vaughan Williams', tags=W, stage='sketch')
P('lucy_wedgwood', 'Lucy Caroline', 'Wedgwood', 'F', '1846-12-21', '1919-06-25', tags=W, stage='sketch')
P('arthur_vw', 'Arthur', 'Vaughan Williams', 'M', died='1875-02', stage='sketch', notes='Vicar of Down Ampney.', todo=['Find birth date'])
P('ralph_vw', 'Ralph', 'Vaughan Williams', 'M', '1872-10-12', '1958-08-26', 'downampney', 'london', stage='in-progress',
  notes='Composer. Great-great-grandson of Josiah Wedgwood, and Charles Darwin’s great-nephew.')
F('vaughan_williams', 'arthur_vw', 'margaret_wedgwood', ['ralph_vw'], end='1875-02', endReason='death', complete='unknown')

# ---- Charles and Emma's children ----
F('charles_emma', 'charles', 'emma',
  ['william', 'annie', 'mary_eleanor', 'henrietta', 'george', 'bessy', 'francis', 'leonard', 'horace', 'charles_waring'],
  start='1839-01-29', end='1882-04-19', endReason='death',
  note='Married at St Peter’s, Maer. Ten children, three of whom died young.')
P('william', 'William Erasmus', 'Darwin', 'M', '1839-12-27', '1914-09-08', 'london', 'sedbergh', tags=D, stage='sketch',
  notes='Banker in Southampton.', src=WP + 'William Erasmus Darwin')
P('sara_sedgwick', 'Sara', 'Sedgwick', 'F', '1839', '1902', married='Darwin', stage='sketch', notes='American, from Cambridge, Massachusetts.')
F('william_sara', 'william', 'sara_sedgwick', [], start='1877', end='1902', endReason='death')
P('annie', 'Anne Elizabeth', 'Darwin', 'F', '1841-03-02', '1851-04-23', dplace='malvern', knownAs='Annie Darwin', tags=D, stage='researched',
  notes="Charles's favourite child. Died at Great Malvern, where she had been taken for the water cure.", src=WP + 'Anne Darwin')
P('mary_eleanor', 'Mary Eleanor', 'Darwin', 'F', '1842-09-23', '1842-10-16', dplace='downe', tags=D, stage='sketch', notes='Lived 23 days.')
P('henrietta', 'Henrietta Emma', 'Darwin', 'F', '1843', '1927', knownAs='Etty Darwin', married='Litchfield', tags=D, stage='sketch',
  notes="Edited her father's books, and her mother's letters.")
P('richard_litchfield', 'Richard Buckley', 'Litchfield', 'M', ('1832', 'likely'), ('1903', 'likely'), stage='sketch')
F('litchfield_darwin', 'richard_litchfield', 'henrietta', [], start='1871')
P('george', 'George Howard', 'Darwin', 'M', '1845-07-09', '1912-12-07', 'downe', 'cambridge', tags=D, stage='in-progress',
  notes='Astronomer and mathematician at Cambridge.', src=WP + 'George Darwin')
P('maud', 'Martha', 'du Puy', 'F', None, '1947-02-06', knownAs='Maud du Puy', married='Darwin', stage='sketch',
  notes='From Philadelphia.', todo=['Find her birth date and place'])
F('george_maud', 'george', 'maud', ['gwen', 'charles_galton', 'margaret_darwin', 'william_robert', 'leonard_1899'], start='1884',
  end='1912-12-07', endReason='death')
P('bessy', 'Elizabeth', 'Darwin', 'F', '1847', '1926', knownAs='Bessy Darwin', tags=D, stage='sketch', notes='Never married.')
P('francis', 'Francis', 'Darwin', 'M', '1848-08-16', '1925-09-19', 'downe', 'cambridge', tags=D, stage='in-progress',
  notes='Botanist; worked with his father on plant movement. Married three times.', src=WP + 'Francis Darwin')
P('amy_ruck', 'Amy Richenda', 'Ruck', 'F', '1850', '1876', married='Darwin', stage='sketch', notes='Died soon after Bernard was born.')
F('francis_amy', 'francis', 'amy_ruck', ['bernard'], start='1874', end='1876', endReason='death')
P('ellen_crofts', 'Ellen Wordsworth', 'Crofts', 'F', ('1856', 'likely'), '1903', married='Darwin', stage='sketch',
  notes='Lecturer in English literature at Newnham College.')
F('francis_ellen', 'francis', 'ellen_crofts', ['frances'], start='1883-09', end='1903', endReason='death')
P('florence_fisher', 'Florence Henrietta', 'Fisher', 'F', ('1864', 'likely'), '1920', married='Darwin', stage='sketch',
  notes='Widow of the legal historian F. W. Maitland.')
F('francis_florence', 'francis', 'florence_fisher', [], start='1913', end='1920', endReason='death')
P('maitland', 'Frederic William', 'Maitland', 'M', '1850', '1906-12', knownAs='F. W. Maitland', stage='sketch', notes='Legal historian.')
F('maitland_fisher', 'maitland', 'florence_fisher', ['ermengard', 'fredegond'], start='1886-07-20', end='1906-12', endReason='death')
P('ermengard', 'Ermengard', 'Maitland', 'F', '1887', '1968', stage='sketch', notes="Francis Darwin's stepdaughter.")
P('fredegond', 'Fredegond', 'Maitland', 'F', '1889', '1949', knownAs='Fredegond Shove', stage='sketch', notes='Poet.')
P('leonard', 'Leonard', 'Darwin', 'M', '1850-01-15', '1943-03-26', 'downe', 'forestrow', tags=D, stage='in-progress',
  notes='Soldier, politician and economist. Married twice; no children.', src=WP + 'Leonard Darwin')
P('elizabeth_fraser', 'Elizabeth Frances', 'Fraser', 'F', None, '1898-01-13', married='Darwin', stage='sketch', todo=['Find birth date'])
F('leonard_elizabeth', 'leonard', 'elizabeth_fraser', [], start='1882-07-11', end='1898-01-13', endReason='death')
P('mildred_massingberd', 'Charlotte Mildred', 'Massingberd', 'F', None, '1940', married='Darwin', stage='sketch',
  notes="Leonard's second cousin.", todo=['Find birth date'])
F('leonard_mildred', 'leonard', 'mildred_massingberd', [], start='1900-11-29', end='1940', endReason='death')
P('horace', 'Horace', 'Darwin', 'M', '1851-05-13', '1928-09-22', 'downe', tags=D, stage='in-progress',
  notes='Engineer; founded the Cambridge Scientific Instrument Company.', src=WP + 'Horace Darwin', todo=['Find place of death (Cambridge?)'])
P('ida_farrer', 'Emma Cecilia', 'Farrer', 'F', '1854', '1946', knownAs='Ida Farrer', married='Darwin', stage='sketch')
F('horace_ida', 'horace', 'ida_farrer', ['erasmus_iv', 'ruth', 'nora'], start='1880-01', end='1928-09-22', endReason='death')
P('charles_waring', 'Charles Waring', 'Darwin', 'M', '1856', '1858-06-28', dplace='downe', tags=D, stage='sketch',
  notes='Died of scarlet fever at about 18 months, during an outbreak in the village.', src='Darwin Correspondence Project')

# ---- Grandchildren (all born before 1900) ----
P('gwen', 'Gwendolen Mary', 'Darwin', 'F', '1885-08-26', '1957-02-11', 'cambridge', 'cambridge', knownAs='Gwen Raverat', married='Raverat', tags=D, stage='sketch',
  notes='Wood engraver; wrote Period Piece, about a Cambridge childhood.')
P('jacques_raverat', 'Jacques', 'Raverat', 'M', died='1925', stage='sketch', notes='French painter.', todo=['Find birth date'])
F('raverat_darwin', 'jacques_raverat', 'gwen', [], start='1911', end='1925', endReason='death', complete='no',
  expected=(2, 'Two daughters, Elisabeth and Sophie; not yet added.'))
P('charles_galton', 'Charles Galton', 'Darwin', 'M', '1887', '1962', tags=D, stage='sketch', notes='Physicist.')
P('margaret_darwin', 'Margaret Elizabeth', 'Darwin', 'F', '1890', '1974', knownAs='Margaret Keynes', married='Keynes', tags=D, stage='sketch')
P('geoffrey_keynes', 'Geoffrey', 'Keynes', 'M', '1887', '1982', stage='sketch', notes='Surgeon; brother of John Maynard Keynes.')
F('keynes_darwin', 'geoffrey_keynes', 'margaret_darwin', [], start='1917', complete='unknown')
P('william_robert', 'William Robert', 'Darwin', 'M', '1894', '1970', tags=D, stage='sketch')
P('leonard_1899', 'Leonard', 'Darwin', 'M', '1899', '1899', tags=D, stage='sketch', notes='Died as a baby.')
P('bernard', 'Bernard Richard Meirion', 'Darwin', 'M', '1876', '1961', knownAs='Bernard Darwin', tags=D, stage='sketch',
  notes='Golfer and golf writer.')
P('frances', 'Frances Crofts', 'Darwin', 'F', '1886-03-30', ('1960-08', 'conflicting'), knownAs='Frances Cornford', married='Cornford',
  tags=D, stage='in-progress', notes='Poet.', src=WP + 'Frances Cornford gives both 19 and 30 August 1960.',
  todo=['Settle her date of death: 19 or 30 August 1960?'])
P('francis_cornford', 'Francis Macdonald', 'Cornford', 'M', ('1874', 'likely'), ('1943', 'likely'), stage='sketch', notes='Classical scholar.')
F('cornford_darwin', 'francis_cornford', 'frances', [], start='1909', complete='unknown')
P('erasmus_iv', 'Erasmus', 'Darwin', 'M', '1881-12-07', '1915-04-24', dplace=('ypres', 'likely'), tags=D, stage='sketch',
  notes='Killed in the Second Battle of Ypres.')
P('ruth', 'Ruth Frances', 'Darwin', 'F', '1883', '1972', tags=D, stage='sketch')
P('nora', 'Emma Nora', 'Darwin', 'F', '1885', '1989', knownAs='Nora Barlow', married='Barlow', tags=D, stage='sketch',
  notes='Botanist; edited her grandfather’s autobiography and Beagle diary.')

used = {e['place']['placeId'] for e in events if 'place' in e}
data = {
    'schemaVersion': '0.2',
    'people': people,
    'families': families,
    'events': events,
    'places': [{'id': 'plc_' + k, 'name': n, 'context': c, 'type': 'town', 'coordinates': {'lat': la, 'lon': lo}}
               for k, (n, c, la, lo) in places.items() if 'plc_' + k in used],
    'sources': [],
    'views': [
        {'id': 'view_charles_family', 'name': "Charles Darwin's family", 'kind': 'tree',
         'scope': {'root': 'per_charles', 'up': 2, 'down': 1, 'width': 'direct'}},
        {'id': 'view_erasmus_desc', 'name': 'Descendants of Erasmus Darwin', 'kind': 'tree',
         'scope': {'root': 'per_erasmus', 'up': 0, 'width': 'direct'}},
        {'id': 'view_wedgwoods', 'name': 'Wedgwoods', 'kind': 'tree', 'scope': {'tags': ['wedgwood']}},
    ],
    'media': [],
}
# every referenced person exists
ids = {p['id'] for p in people}
for f in families:
    for r in f['partners'] + f['children']:
        assert r['personId'] in ids, r
kids = [c['personId'] for f in families for c in f['children']]
assert len(kids) == len(set(kids)), 'a child in two families'
unknown = set(SOURCES) - {p['id'][4:] for p in people}
assert not unknown, unknown
json.dump(data, open(sys.argv[1], 'w'), indent='\t', ensure_ascii=False)
print(len(people), 'people,', len(families), 'families,', len(events), 'events,', len(data['places']), 'places')
