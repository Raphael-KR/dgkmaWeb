"""stdin-only web adapter; never invoke the upstream network/CLI path."""
import json
import sys
from types import SimpleNamespace
from extract_gipoom import select_fields, parse_iso
from render_obituary import is_honorary_chair, render
from validate_obituary import validate

try:
    payload = json.load(sys.stdin)
    data = payload['data']
    if payload.get('action') == 'extract':
        selected = select_fields(data, payload['url'])
        deceased = data['fevent']['deceasedInfo']
        death_date = deceased.get('deathDate')
        if death_date:
            selected['deceased']['deathDate'] = parse_iso(death_date).date().isoformat()
        selected['funeral']['cemetery'] = deceased.get('cemetery')
        selected['funeral']['visitationDeclined'] = deceased.get('visitationDeclined') is True
        print(json.dumps(selected, ensure_ascii=False))
        sys.exit(0)
    args = SimpleNamespace(format='homepage', band_url=None, **payload['options'])
    text, format_name, selected_url, year = render(data, args)
    honorary_chair = is_honorary_chair(args.title)
    errors, _ = validate(text, SimpleNamespace(
        format_name=format_name, year=year, expected_link=selected_url,
        expected_band_link=None,
        expect_honorary_chair=honorary_chair,
        expected_death_date=data['deceased'].get('deathDate'),
        expected_cemetery=data['funeral'].get('cemetery'),
        expect_visitation_declined=data['funeral'].get('visitationDeclined') is True,
    ))
    if errors:
        raise ValueError('Invalid rendered notice')
    result = {'content': text}
    if honorary_chair:
        result['honoraryChairHeading'] = text.splitlines()[1]
    print(json.dumps(result, ensure_ascii=False))
except Exception:
    # Neither input facts nor renderer diagnostics enter subprocess/server logs.
    print(json.dumps({'error': '부고 정보의 날짜·연락처·회원 표기를 다시 확인해 주세요.'}, ensure_ascii=False))
    sys.exit(1)
