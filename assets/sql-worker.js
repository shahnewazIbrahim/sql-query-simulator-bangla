/* SQL stays in a disposable worker. The page terminates long-running queries. */
importScripts('sql-wasm.js','curriculum.js');
let SQL, db;
const fresh=()=>{const d=new SQL.Database(); d.run(SQLCourse.seed); return d;};
function execute(d,sql){
 if(sql.length>50000) throw Error('Query is too long (maximum 50,000 characters).');
 const results=[]; let affected=0, statements=0;
 const iterator=d.iterateStatements(sql);
 try {for(const stmt of iterator){try{statements++;const columns=stmt.getColumnNames();const values=[];let count=0;while(stmt.step()){count++;if(count<=300)values.push(stmt.get());if(count>10000)throw Error('Result exceeds 10,000 rows. Add LIMIT to your query.');}if(columns.length)results.push({columns,values,count});else if(/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(stmt.getSQL().replace(/--[^\n]*|\/\*[\s\S]*?\*\//g,''))) affected+=d.getRowsModified();}finally{stmt.free();}}}finally{iterator.return?.();}
 if(!statements)throw Error('Write a SQL statement first.');
 return {results,affected};
}
function explorer(){return db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")[0]?.values.map(([name])=>({name,columns:db.exec('PRAGMA table_info('+quote(name)+')')[0]?.values||[],foreign:db.exec('PRAGMA foreign_key_list('+quote(name)+')')[0]?.values||[],rows:db.exec('SELECT * FROM '+quote(name)+' LIMIT 100')[0]||{columns:[],values:[]},count:db.exec('SELECT COUNT(*) FROM '+quote(name))[0].values[0][0]}))||[];}
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const canonical=(result,ordered)=>{const values=result?.values||[];return JSON.stringify(ordered?values:values.map(JSON.stringify).sort());};
function snapshot(d){return JSON.stringify(d.exec("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")[0]?.values.map(([name,sql])=>[name,sql,canonical(d.exec('SELECT * FROM '+quote(name))[0],false)])||[]);}
function check(sql,index){const c=SQLCourse.challenges[index];if(!c)throw Error('Unknown challenge');const a=fresh(),b=fresh();try{const actual=execute(a,sql),expected=execute(b,c.sql);const ar=actual.results.at(-1),er=expected.results.at(-1);const correct=c.mutation?snapshot(a)===snapshot(b):!!ar&&ar.columns.length===er.columns.length&&canonical(ar,c.ordered)===canonical(er,c.ordered)&&snapshot(a)===snapshot(b);return{correct,expected:er,actual:ar};}finally{a.close();b.close();}}
onmessage=async({data})=>{const {id,type,sql,index}=data;try{if(type==='init'){SQL=await initSqlJs({locateFile:f=>f});db=fresh();postMessage({id,ok:true,tables:explorer(),version:db.exec('SELECT sqlite_version()')[0].values[0][0]});return;}if(type==='reset'){db.close();db=fresh();}const start=performance.now();const output=type==='run'?execute(db,sql):type==='check'?check(sql,index):{};postMessage({id,ok:true,...output,duration:performance.now()-start,tables:explorer()});}catch(error){postMessage({id,ok:false,error:error.message});}};
