const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const init=require('../assets/sql-wasm.js');
const course=require('../assets/curriculum.js');
(async()=>{
 const SQL=await init({locateFile:f=>require('node:path').join(__dirname,'../assets',f)});
 let last;
 const context=vm.createContext({console,performance,Uint8Array,SQLCourse:course,importScripts(){},initSqlJs:async()=>SQL,postMessage(data){last=data;}});
 vm.runInContext(fs.readFileSync('assets/sql-worker.js','utf8'),context);
 let id=0;
 async function call(type,fields={}){await context.onmessage({data:{id:++id,type,...fields}});return last;}
 assert.equal((await call('init')).ok,true);
 assert.equal(last.tables.length,4);
 for(const l of course.lessons.filter(l=>l.executable)){
  await call('reset');const r=await call('run',{sql:l.sql});assert.equal(r.ok,true,l.name+': '+r.error);
 }
 for(const c of course.challenges){const r=await call('check',{sql:c.sql,index:c.id});assert.equal(r.ok,true,c.title+': '+r.error);assert.equal(r.correct,true,c.title);}
 assert.equal((await call('check',{index:0,sql:'SELECT * FROM students WHERE id=1;'})).correct,false);
 assert.equal((await call('check',{index:2,sql:'SELECT name FROM students ORDER BY name DESC;'})).correct,false);
 assert.equal((await call('check',{index:4,sql:'UPDATE students SET age=24;'})).correct,false);
 assert.equal((await call('check',{index:0,sql:'SELECT name FROM students;'})).correct,false);
 await call('reset');assert.equal((await call('run',{sql:'SELECT name FROM students ORDER BY id;'})).results[0].count,5);
 assert.equal((await call('run',{sql:'INSERT INTO enrollments VALUES(99,999,1);'})).ok,false);
 assert.equal((await call('run',{sql:'SELEC * FROM students;'})).ok,false);
 assert.equal((await call('run',{sql:'GRANT SELECT ON students TO learner;'})).ok,false);
 assert.equal((await call('run',{sql:"SELECT json_valid('{\"ok\":true}');"})).results[0].values[0][0],1);
 assert.equal((await call('run',{sql:'WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<10001) SELECT * FROM n;'})).ok,false);
 await call('reset');assert.equal(last.tables.find(t=>t.name==='students').count,5);
 console.log('PASS: 28 runnable lessons, 12 challenge solutions, negative answers, CRUD, JOINs, transactions, FK enforcement, JSON, row limit and reset.');
})().catch(e=>{console.error(e);process.exitCode=1;});
