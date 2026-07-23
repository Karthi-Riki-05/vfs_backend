const svc = require("/app/src/services/aiDetect.service");
const cases = [
  ["FLOWCHART","Create a flowchart for user login with a decision on password valid"],
  ["BAR","Make a bar chart of quarterly sales Q1 100 Q2 150 Q3 90 Q4 200"],
  ["LINE","Draw a line chart of monthly signups Jan to May trending up"],
  ["UML-CLASS","Generate a UML class diagram for a User class with id, email, login()"],
  ["UML-SEQ","Create a UML sequence diagram: User sends login to Server, Server returns token"],
  ["ER","Make an ER diagram for Users and Orders with a one-to-many relation"],
  ["NETWORK","Draw a network diagram: internet firewall router two servers"],
  ["CLOUD","Create an AWS architecture: API Gateway to Lambda to RDS"],
  ["BPMN","Make a BPMN process: start, review request, approve gateway, end"],
  ["VENN","Draw a Venn diagram of Frontend and Backend skills overlap"],
  ["WIREFRAME","Make a wireframe of a login screen with email field, password field, login button"],
];
const KEYS = {
  FLOWCHART:/rhombus|edgeStyle=orthogonal/, BAR:/whiteSpace=wrap.*fillColor/,
  LINE:/ellipse.*width="10"|endArrow=none/, "UML-CLASS":/swimlane|stackLayout/,
  "UML-SEQ":/umlLifeline/, ER:/ERmany|ERone|swimlane/,
  NETWORK:/mxgraph\.networks/, CLOUD:/mxgraph\.aws4|resIcon/,
  BPMN:/ellipse.*strokeWidth=3|rhombus/, VENN:/fillOpacity/,
  WIREFRAME:/mxgraph\.mockup/,
};
(async()=>{
  for (const [label,msg] of cases){
    try{
      const {xml,model}=await svc.generateDiagramXml(msg,null);
      const cells=(xml.match(/vertex="1"/g)||[]).length;
      const styles=[...xml.matchAll(/style="([^"]+)"/g)].map(m=>m[1]);
      const hit = KEYS[label] ? styles.some(s=>KEYS[label].test(s)) || KEYS[label].test(xml) : true;
      const shapes=[...new Set(styles.map(s=>{
        const m=s.match(/shape=[^;]+/); if(m)return m[0];
        return (s.match(/^(ellipse|rhombus|swimlane|rounded=1|rounded=0|text)/)||["?"])[0];
      }))];
      console.log(`${hit?"OK ":"?? "} ${label.padEnd(10)} ${cells}n  ${shapes.join(" | ").slice(0,90)}`);
    }catch(e){ console.log(`FAIL ${label.padEnd(10)} ${e.message}`); }
  }
  process.exit(0);
})();
