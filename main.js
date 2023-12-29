const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const download = require('download');
const glob = require('glob');

// Function to generate a random string of numbers and/or letters
const generateRandomString = (length) => {
	const characters =
		'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	let result = '';
	for (let i = 0; i < length; i++) {
		result += characters.charAt(Math.floor(Math.random() * characters.length));
	}
	return result;
};

// Function to calculate approximate time remaining
const calculateApproximateTimeRemaining = (
	elapsedTime,
	filesRemaining,
	largestFileSize
) => {
	if (elapsedTime === 0 || largestFileSize === 0) {
		return 'N/A'; // Avoid division by zero
	}

	const remainingTimeInSeconds =
		(filesRemaining * largestFileSize) / largestFileSize;
	const remainingMinutes = Math.floor(remainingTimeInSeconds / 60);
	const remainingSeconds = Math.floor(remainingTimeInSeconds % 60);

	return `${remainingMinutes} minutes and ${remainingSeconds} seconds`;
};

// Function to clean the URL and create a directory name
const createDirectoryName = (url) => {
	// Remove 'https://www.pexels.com/search/videos' and 'orientation=portrait' from the URL
	const cleanedUrl = url
		.replace(/https:\/\/www\.pexels\.com\/search\/videos/g, '')
		.replace(/\?orientation=portrait/g, '');
	return cleanedUrl.replace(/[^a-zA-Z0-9]/g, '');
};

// Function to check if a file exists in any subdirectories
const fileExistsInSubdirectories = (fileName, directoryPath) => {
	const files = glob.sync(`**/${fileName}`, {
		nodir: true,
		cwd: directoryPath,
	});
	return files.length > 0;
};

(async () => {
	// Get the URL from the command-line arguments (if provided)
	const rawUrl = process.argv[2];

	if (!rawUrl) {
		console.error('Please provide a URL as a command-line argument.');
		process.exit(1);
	}

	const url = decodeURIComponent(rawUrl);

	const browser = await puppeteer.launch({
		headless: false,
		defaultViewport: null,
		args: ['--start-maximized'],
		timeout: 0,
		waitUntil: 'domcontentloaded',
		protocolTimeout: 0,
	});

	const page = await browser.newPage();

	// Measure the time taken to scroll to the bottom of the page
	const startScrollTime = Date.now();

	// Variable to store the last printed time in seconds
	let lastPrintedTimeInSeconds = 0;

	// Counter for skipped downloads
	let skippedCount = 0;

	// Counter for total bytes downloaded
	let totalBytesDownloaded = 0;

	// Counter for downloaded files
	let downloadedFiles = 0;

	// Number of files to consider for average speed calculation
	const filesPerInterval = 10;

	// Largest file size from the last 10 non-skipped downloads
	let largestFileSize = 0;

	// Function to print total time elapsed in increments of 30 seconds
	const printElapsedTime = () => {
		const currentTime = Date.now();
		const elapsedSeconds = Math.floor((currentTime - startScrollTime) / 1000);

		if (
			elapsedSeconds > lastPrintedTimeInSeconds &&
			elapsedSeconds % 30 === 0
		) {
			console.log(`Total time running: ${elapsedSeconds} seconds...`);
			lastPrintedTimeInSeconds = elapsedSeconds;
		}
	};

	// Timer to periodically print total time elapsed
	const elapsedTimeInterval = setInterval(printElapsedTime, 1000);

	await page.goto(url, { waitUntil: 'domcontentloaded' });

	// Function to scroll to the bottom of the page
	const scrollToEnd = async () => {
		await page.evaluate(async () => {
			await new Promise((resolve) => {
				let totalHeight = 0;
				const distance = 100;
				const timer = setInterval(() => {
					const scrollHeight = document.body.scrollHeight;
					window.scrollBy(0, distance);
					totalHeight += distance;

					if (totalHeight >= scrollHeight) {
						clearInterval(timer);
						resolve();
					}
				}, 100);
			});
		});
	};

	// Scroll to the bottom of the page
	await scrollToEnd();

	// Calculate and print the time taken to scroll to the bottom
	const endScrollTime = Date.now();
	const scrollDuration = (endScrollTime - startScrollTime) / 1000; // Convert to seconds
	console.log(
		`Scrolled to the bottom of the page in ${scrollDuration.toFixed(2)} seconds`
	);

	// Wait for video elements to be present with retries
	const maxRetries = 5;
	let retryCount = 0;
	while (retryCount < maxRetries) {
		try {
			await page.waitForSelector('video', { timeout: 10000 });
			break;
		} catch (error) {
			console.log(
				`Retry ${retryCount + 1}/${maxRetries} - Waiting for video selector...`
			);
			retryCount++;
		}
	}

	if (retryCount === maxRetries) {
		console.error('Timeout waiting for video selector. Exiting script.');
		clearInterval(elapsedTimeInterval);
		await browser.close();
		return;
	}

	// Extract video URLs
	const videoLinks = await page.evaluate(() => {
		const links = [];
		const videoElements = document.querySelectorAll('video');

		videoElements.forEach((video) => {
			const source = video.querySelector('source');
			if (source && source.src) {
				links.push(source.src);
			}
		});

		return links;
	});

	// Create a directory based on the cleaned URL
	const directoryName = createDirectoryName(url);
	const directoryPath = `${__dirname}/${directoryName}`;

	if (!fs.existsSync(directoryPath)) {
		fs.mkdirSync(directoryPath);
	}

	// Display total number of videos found
	console.log(`Found ${videoLinks.length} videos on the page`);

	// Download videos with original file names into the created directory
	for (let i = 0; i < videoLinks.length; i++) {
		const videoUrl = videoLinks[i];

		// Extract the file name from the URL
		const fileNameMatch = videoUrl.match(/\/([^\/?#]+)[^\/]*$/);
		let fileName = fileNameMatch ? fileNameMatch[1] : `video_${i + 1}.mp4`;

		// Check if the file already exists in any subdirectories
		if (fileName === 'file' || fileName === 'file.mp4') {
			fileName = generateRandomString(12) + '.mp4';
		} else if (fileExistsInSubdirectories(fileName, directoryPath)) {
			skippedCount++;
			console.log(
				`Skipped download for existing file (${skippedCount} skipped): ${fileName}`
			);
			continue;
		}

		// Measure the time taken to download each file
		const startDownloadTime = Date.now();

		console.log(`Downloading video ${i + 1}/${videoLinks.length}`);
		const fileBuffer = await download(videoUrl, directoryPath, {
			filename: fileName,
		});

		// Calculate the time taken to download
		const endDownloadTime = Date.now();
		const downloadElapsedTime = (endDownloadTime - startDownloadTime) / 1000; // Convert to seconds

		// Update the total bytes downloaded
		totalBytesDownloaded += fileBuffer.length;

		// Update the largest file size if applicable
		if (fileBuffer.length > largestFileSize) {
			largestFileSize = fileBuffer.length;
		}

		// Increment the downloaded files counter
		downloadedFiles++;

		// Print the approximate time remaining for every 10 downloaded files
		if (downloadedFiles % filesPerInterval === 0) {
			// Calculate remaining files and approximate time remaining
			const remainingFiles = videoLinks.length - (i + 1);
			const timeRemaining = calculateApproximateTimeRemaining(
				downloadElapsedTime,
				remainingFiles,
				largestFileSize
			);

			console.log(`Approximate Time Remaining: ${timeRemaining}`);
		}

		// Sleep for 10 seconds between downloads
		await new Promise((resolve) => setTimeout(resolve, 10000));

		console.log(`Downloaded ${fileName}`);
		const percentComplete = ((i + 1) / videoLinks.length) * 100;
		console.log(`Approximately ${percentComplete.toFixed(2)}% completed`);
	}

	// Stop the elapsed time interval timer
	clearInterval(elapsedTimeInterval);

	await browser.close();
})();
