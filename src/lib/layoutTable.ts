import { formatAllianceName } from './formatting';
import { trimHeader } from './warWeb';
import type { Conflict, TableData } from './index';

export function computeLayoutTableData(
    _rawData: Conflict,
    type: number,
    layout: string[],
    sortBy: string,
    sortDir: string,
): TableData {
    let coalitions = _rawData.coalitions;
    let damage_header = _rawData.damage_header;
    let header_types = _rawData.header_type;

    let rows: any[][] = [];
    let columns: string[] = [];
    let searchable: number[] = [];
    let visible: number[] = [];
    let cell_format: { [key: string]: number[] } = {};
    let row_format:
        | ((row: HTMLElement, data: { [key: string]: any }, index: number) => void)
        | null = null;

    switch (type) {
        case 0:
            row_format = null;
            break;
        case 1:
            row_format = null;
            break;
        case 2:
            row_format = null;
            break;
    }

    columns.push('name');
    for (let i = 0; i < damage_header.length; i++) {
        let header = trimHeader(damage_header[i]);
        let t = header_types[i];
        if (t == 0) {
            columns.push(`loss:${header}`);
            columns.push(`dealt:${header.replace('_loss', '').replace('loss_', '')}`);
            columns.push(`net:${header.replace('_loss', '').replace('loss_', '')}`);
        } else if (t == 1) {
            columns.push(`def:${header}`);
            columns.push(`off:${header}`);
            columns.push(`both:${header}`);
        }
    }

    searchable.push(0);
    if (type === 0) {
        cell_format['formatCol'] = [0];
    } else if (type === 1) {
        cell_format['formatAA'] = [0];
    } else if (type === 2) {
        cell_format['formatNation'] = [0];
    }

    const sortIndex = Math.max(0, columns.indexOf(sortBy));
    let sort: [number, string] = [sortIndex, sortDir];

    cell_format['formatNumber'] = [];
    cell_format['formatMoney'] = [];
    for (let i = 0; i < columns.length; i++) {
        if (layout.includes(columns[i])) {
            visible.push(i);
        }
        if (i > 0) {
            if (
                columns[i].includes('~') ||
                columns[i].includes('damage') ||
                (columns[i].includes('infra') && !columns[i].includes('attacks'))
            ) {
                cell_format['formatMoney'].push(i);
            } else {
                cell_format['formatNumber'].push(i);
            }
        }
    }

    let addStats2Row = (row: any[], damageTaken: any, damageDealt: any) => {
        for (let i = 0; i < damageTaken.length; i++) {
            let damageTakenStat = damageTaken[i];
            let damageDealtStat = damageDealt[i];

            let tt = header_types[i];
            let total;
            if (tt == 0) {
                total = damageDealtStat - damageTakenStat;
            } else {
                total = damageDealtStat + damageTakenStat;
            }
            row.push(damageTakenStat);
            row.push(damageDealtStat);
            row.push(total);
        }
    };

    let addRow = (colEntry: any, index: number) => {
        let alliance_ids = colEntry.alliance_ids;
        let alliance_names = colEntry.alliance_names;
        let nation_ids = colEntry.nation_ids;
        let nation_names = colEntry.nation_names;
        let nation_aas = colEntry.nation_aa;
        let damage = colEntry.damage;
        switch (type) {
            case 0:
                let row = [index];
                addStats2Row(row, damage[0], damage[1]);
                rows.push(row);
                break;
            case 1:
                let o = 2;
                for (let i = 0; i < alliance_ids.length; i++) {
                    let row = [];
                    let alliance_id = alliance_ids[i];
                    let alliance_name = formatAllianceName(alliance_names[i], alliance_id);
                    row.push([alliance_name, alliance_id]);
                    addStats2Row(row, damage[i * 2 + o], damage[i * 2 + o + 1]);
                    rows.push(row);
                }
                break;
            case 2:
                let oo = 2 + alliance_ids.length * 2;
                for (let i = 0; i < nation_ids.length; i++) {
                    let row = [];
                    let nation_id = nation_ids[i];
                    let nation_name = nation_names[i];
                    let nation_aa = nation_aas[i];
                    row.push([nation_name, nation_id, nation_aa]);
                    addStats2Row(row, damage[i * 2 + oo], damage[i * 2 + oo + 1]);
                    rows.push(row);
                }
                break;
        }
    };

    for (let i = 0; i < coalitions.length; i++) {
        let colEntry = coalitions[i];
        addRow(colEntry, i);
    }

    return {
        columns,
        data: rows,
        visible,
        searchable,
        cell_format,
        row_format,
        sort,
    } as TableData;
}
