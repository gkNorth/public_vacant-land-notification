const puppeteer = require('puppeteer');
const {Sequelize, DataTypes} = require('sequelize');
const siteList = require('./json/site-list.json');
const account = require('./json/gmail.json');
const send = require('gmail-send')({
  user: account.user,
  pass: account.pass,
  to:   account.to,
  subject: account.subject,
});

const sequelize = new Sequelize('scrap_site_test', 'root', '****', {
  host: 'localhost',
  dialect: 'mysql',
  logging: false,
});

const Sites = sequelize.define('Sites', {
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  price: {
    type: DataTypes.STRING,
    allowNull: true
  },
  url: {
    type: DataTypes.STRING(1000),
    allowNull: false
  },
});

(async () => {
  console.log('Start for scraping...');
  const scrapingData = [];
  for (const site of siteList) {
    const browser = await puppeteer.launch({headless: true});
    const page = await browser.newPage();
    await page.goto(site.url);
    
    const items = await page.$$(site.liClass);

    for (const item of items) {
      const aTag = await item.$(site.ttlClass);
      const title = 
        await (await (await aTag.getProperty('textContent')).jsonValue()).trim();
      const href = await aTag.getProperty('href');
      const url = await href.jsonValue();
      const priceEl = await item.$(site.priceClass);
      const price = await (await priceEl.getProperty('textContent')).jsonValue();
      
      scrapingData.push({
        name: site.name,
        title: title,
        price: price,
        url: url,
      });
    }
    await browser.close();
  }
  
  const storeData = [];
  for (const item of scrapingData) {
    if (item.url.includes('ads')) continue;
    await sequelize
      .query(
        `SELECT * FROM Sites WHERE url = "${item.url}"`,
        { type: Sequelize.QueryTypes.SELECT }
      ).then(res => {
        if (!res.length) {
          storeData.push(item);
        }
      });
  }
  
  let html = '<h4>【土地一覧】</h4><br>';
  for (const [index, item] of scrapingData.entries()) {
    const row =
    `
      ---------------<br>
      id: ${index + 1}<br>
      <a href="${item.url}">${item.title}</a><br>
      価格: ${item.price}<br>
      サイト名: ${item.name}<br>
      <br>
    `;
    html = html.concat(row);
  }
  
  let updatedMsg = 
    `
      更新はありません！<br>
      <br>
    `;
  if (storeData.length) {
    console.log('更新情報があります');
    let updateData = '';
    for (const item of storeData) {
      const row =
      `
        <a href="${item.url}">${item.title}</a><br>
        価格: ${item.price}<br>
        サイト名: ${item.name}<br>
      `;
      updateData = updateData.concat(row);
    }
    updatedMsg = 
      `
        更新がありました！<br>
        ---------<br>
        ${updateData}
        ---------<br>
        <br>
      `;
    await Sites.sync({alter: true});
    // await Sites.destroy({truncate: true});
    await Sites.bulkCreate(storeData);
    
    console.log('データベースを更新しました');
  } else {
    console.log('更新情報はありません');
  }
  
  await send({
    html: `${updatedMsg}${html}`,  
  }, (error, result, fullResult) => {
    if (error) console.error(error);
    console.log(result);
  })
  console.log('メール送信しました');

  await sequelize.close();
})();