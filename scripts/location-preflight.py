#!/usr/bin/env python3
"""Read-only inventory of duplicate master records and location references. No secrets."""
import json, sqlite3, pathlib, sys
path=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '/opt/fragrance-inventory/db/fragrance.db').resolve(strict=True)
c=sqlite3.connect(path.as_uri()+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
c.execute('PRAGMA query_only=ON')
c.execute('BEGIN')
try:
    refs=[('stock_balances','location_id'),('stock_movements','location_id'),('stock_in_orders','location_id'),('sales','location_id'),('transfers','from_location_id'),('transfers','to_location_id'),('split_orders','location_id')]
    columns={r['name'] for r in c.execute('PRAGMA table_info(users)')}
    if 'location_id' in columns: refs.append(('users','location_id'))
    locations=[]
    for row in c.execute('SELECT id,name,type FROM locations ORDER BY id'):
        item=dict(row)
        item['references']={table+'.'+col:c.execute('SELECT count(*) FROM '+table+' WHERE '+col+'=?',(row['id'],)).fetchone()[0] for table,col in refs}
        item['stock_units']=c.execute('SELECT coalesce(sum(quantity),0) FROM stock_balances WHERE location_id=?',(row['id'],)).fetchone()[0]
        locations.append(item)
    duplicates={}
    for table,col,where in [('locations','name','1'),('brands','name','is_deleted=0'),('customers','phone',"trim(phone)<>''"),('skus','barcode',"is_deleted=0 AND barcode IS NOT NULL AND barcode<>''")]:
        # Return IDs only for phone/barcode groups, never customer contact details.
        duplicates[table]=[{'ids':r[0],'count':r[1]} for r in c.execute('SELECT group_concat(id),count(*) FROM '+table+' WHERE '+where+' GROUP BY lower(trim('+col+')) HAVING count(*)>1')]
    fields='id,role'+(',location_id' if 'location_id' in columns else '')+(',enabled' if 'enabled' in columns else '')
    print(json.dumps({'read_only':True,'database':str(path),'integrity':[r[0] for r in c.execute('PRAGMA integrity_check')],'foreign_key_errors':len(c.execute('PRAGMA foreign_key_check').fetchall()),'locations':locations,'duplicates':duplicates,'users':[dict(r) for r in c.execute('SELECT '+fields+' FROM users ORDER BY id')]},ensure_ascii=False,indent=2))
finally:
    c.rollback();c.close()
