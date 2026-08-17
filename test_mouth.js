const fs = require('fs')
const model = JSON.parse(fs.readFileSync('C:\\Users\\games\\OneDrive\\Документы\\МЕДИАВОЛНА\\ГОЛОВА\\src\\assets\\avatar.json', 'utf8'))

const rows = model.rows
const cols = model.cols
let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1

// Let's copy the detectModelMouth fallback logic:
let mouthArea = []
for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
        if (model.is_mouth && model.is_mouth[y] && model.is_mouth[y][x]) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
        }
    }
}

let explicit = false
if (maxX !== -1) {
    explicit = true
    console.log(`Explicit mouth: y=${Math.floor((minY+maxY)/2)}, cx=${Math.floor((minX+maxX)/2)}, w=${maxX-minX+1}`)
}

if (!explicit) {
    console.log("No explicit mouth, would run hole detection.")
    // Find holes (components of ' ' that are enclosed)
    // Actually we just need to know if the JSON contains is_mouth
    console.log("is_mouth exists in json:", !!model.is_mouth)
}

// Check eyes
let eyeMinX = Infinity, eyeMaxX = -1, eyeMinY = Infinity, eyeMaxY = -1
for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
        if (model.is_eye && model.is_eye[y] && model.is_eye[y][x]) {
            if (x < eyeMinX) eyeMinX = x
            if (x > eyeMaxX) eyeMaxX = x
            if (y < eyeMinY) eyeMinY = y
            if (y > eyeMaxY) eyeMaxY = y
        }
    }
}
console.log(`Explicit eyes: y=${Math.floor((eyeMinY+eyeMaxY)/2)}, w=${eyeMaxX-eyeMinX+1}`)
