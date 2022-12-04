fs = require('fs').promises

const CheckpointFileName = ".bh_scrape_checkpoint_state"

/**
 * Retrieves the latest checkpoint converting the GMail message date to a Date
 * object.
 */
exports.getCheckpoint = async function() {
    try
    {
        const content = await fs.readFile(`./${CheckpointFileName}`);
        const checkpoint = JSON.parse(content);
        const checkpointDate = new Date(parseInt(checkpoint.date));
        console.log(`Checkpoint date loaded: ${checkpointDate}.`);
        return checkpointDate;
    } catch (err) {
        return null;
    }   
}

/**
 * Sets the latest checkpoint using the GMail message date to mark the most
 * recently scraped mail.
 * @param {*} gmailIndernalDate 
 */
exports.setCheckpoint = async function(gmailIndernalDate) {
    var saveModel = {date: gmailIndernalDate};
    const saveBytes = JSON.stringify(saveModel);
    await fs.writeFile(`./${CheckpointFileName}`, saveBytes);
}
