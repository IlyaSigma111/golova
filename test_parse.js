const fs = require('fs')
const text = fs.readFileSync('C:\\Users\\games\\OneDrive\\Документы\\МЕДИАВОЛНА\\ГОЛОВА\\src\\assets\\avatar.json', 'utf8')
const d = JSON.parse(text)
console.log("rows:", d.rows, "cols:", d.cols)
const rows = Math.max(1, Math.min(1500, Math.floor(d.rows)))
const cols = Math.max(1, Math.min(1500, Math.floor(d.cols)))
const g = d.grid_char
console.log("isArray(g):", Array.isArray(g))
if (Array.isArray(g)) {
  console.log("g.length:", g.length, "expected:", rows)
  if (g.length > 0) {
    console.log("g[0].length:", g[0].length, "expected:", cols)
  }
}
