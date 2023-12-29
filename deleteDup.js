const fs = require('fs');
const crypto = require('crypto');

function getFileHash(filePath) {
	const data = fs.readFileSync(filePath);
	return crypto.createHash('sha256').update(data).digest('hex');
}

function deleteDuplicateFiles(directory) {
	const hashToFileMap = {};

	// Read all files in the directory
	const files = fs.readdirSync(directory);

	files.forEach((file) => {
		const filePath = `${directory}/${file}`;
		if (fs.statSync(filePath).isFile()) {
			const fileHash = getFileHash(filePath);

			// Check if the hash already exists
			if (hashToFileMap[fileHash]) {
				// Delete the duplicate file
				fs.unlinkSync(filePath);
				console.log(`Deleted duplicate file: ${filePath}`);
			} else {
				// Store the hash for future comparison
				hashToFileMap[fileHash] = filePath;
			}
		}
	});
}

// Example: Specify the directory path
const directoryPath = './weddingceremony';
deleteDuplicateFiles(directoryPath);
