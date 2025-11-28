
const DEFAULT_STYLES = {
    gridColumns: { sm: 1, md: 2, lg: 3, xl: 4 },
    contentGridColumns: { sm: 1, md: 2, lg: 3, xl: 4 }
};

let styles = { ...DEFAULT_STYLES };

// Simulate updateNestedStyle
const updateNestedStyle = (key, value) => {
    const prev = styles;
    const updated = JSON.parse(JSON.stringify(prev));
    const keys = key.split('.');
    let current = updated;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
            current[keys[i]] = {};
        }
        current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    styles = updated;
};

console.log("Initial:");
console.log("gridColumns:", styles.gridColumns);
console.log("contentGridColumns:", styles.contentGridColumns);

console.log("\nUpdating gridColumns.sm to 5...");
updateNestedStyle('gridColumns.sm', 5);

console.log("gridColumns:", styles.gridColumns);
console.log("contentGridColumns:", styles.contentGridColumns);

if (styles.contentGridColumns.sm === 5) {
    console.log("\nFAIL: contentGridColumns.sm changed!");
} else {
    console.log("\nPASS: contentGridColumns.sm did not change.");
}

console.log("\nUpdating contentGridColumns.sm to 6...");
updateNestedStyle('contentGridColumns.sm', 6);

console.log("gridColumns:", styles.gridColumns);
console.log("contentGridColumns:", styles.contentGridColumns);

if (styles.gridColumns.sm === 6) {
    console.log("\nFAIL: gridColumns.sm changed!");
} else {
    console.log("\nPASS: gridColumns.sm did not change.");
}
