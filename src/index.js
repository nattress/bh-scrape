import {google, Auth, Common} from "googleapis";
import fs from "fs";
import imageDownloader from "image-downloader";
import authorization from "./authorization.cjs";
import checkpoint from "./checkpoint.cjs";
import logging from "./logging.cjs";
import {fileTypeFromFile} from 'file-type';

//
// Config
//

const SaveFolder = "C:\\Users\\Simon\\Dropbox\\maira_in";
//const SaveFolder = "C:\\temp";

//
// Search for things that look like image Urls in the mail body.
//
function getImagesFromMail(mailBody)
{
  const searchTerm = "https://productionmbd.brighthorizons.com/m/snapshot"
  var searchIndex = mailBody.indexOf(searchTerm);
  var images = [];
  while (searchIndex != -1)
  {
    // Read the Url up to the closing quotation mark.
    const endQuoteIndex = mailBody.indexOf("\"", searchIndex);
    const imageUrl = mailBody.slice(searchIndex, endQuoteIndex);

    images.push(imageUrl);

    searchIndex = mailBody.indexOf(searchTerm, searchIndex + 1);
  }

  return images;
}

/**
 * Lists the mail in the user's account.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function listMail(auth) {
  var last72Hours = new Date();
  last72Hours.setTime(last72Hours.getTime() - (72 * 60 * 60 * 1000));
  
  const gmail = google.gmail({version: 'v1', auth});
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: `Daily Report for Maira after:${last72Hours.toLocaleDateString()}`
  });
  
  const messages = res.data.messages.reverse();
  var checkpointDate = await checkpoint.getCheckpoint();

  for (const message of messages) {
    const mail = await gmail.users.messages.get({
      userId: 'me',
      id: message.id
    });

    var to_date = new Date(parseInt(mail.data.internalDate));
    var fileDate = `${to_date.getFullYear()}-${("00" + (to_date.getMonth() + 1)).slice(-2)}-${("00" + to_date.getDate()).slice(-2)}`

    if (checkpointDate != null && to_date <= checkpointDate)
    {
      logging.logger.debug(`Skipping previously downloaded photos for ${to_date.toLocaleDateString()}.`);
      continue;
    }
    
    let body_content = JSON.stringify(mail.data.payload.body.data);
    let data, buff;
    data = body_content;
    buff = new Buffer.from(data, "base64");
    var mailBody = buff.toString();

    const images = getImagesFromMail(mailBody);

    logging.logger.debug(`Saving ${images.length} photos for ${to_date.toLocaleDateString()}`)
    var i = 1;
    for (var img of images)
    {
      let imageFileName = `${SaveFolder}\\${fileDate}_${i}.png`;
      let mp4FileName = `${SaveFolder}\\${fileDate}_${i}.mp4`;

      await imageDownloader.image({
        url: img,
        dest: imageFileName
      });

      var type = await fileTypeFromFile(imageFileName);

      console.log(type);

      if (type.mime != "image/png" && type.mime != "image/jpeg")
      {
        console.log("Ooh, a video :)");
        await fs.rename(imageFileName, mp4FileName, (err) => {
          if (err) console.log("Error:" + err);
        });
      }
      
      i++;
    }

    await checkpoint.setCheckpoint(mail.data.internalDate);
  };
}

authorization.authorize().then(listMail).catch(logging.logger.error.bind(logging.logger));
