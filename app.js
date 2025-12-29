require("dotenv").config();

const commands = require("./commands.js");


const DB = require("./connectDB.js");
const dataBase = DB.connect('pw_bot');
const orderBase = DB.connect('pw_orders_bot');
const subsBase = DB.connect('pw_subscription');

const { Telegraf, session, Scenes } = require("telegraf");
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();
const querystring = require("querystring");

// Переменные для работы
const ADMIN_ID = process.env.ADMIN_ID;
const URL_APP = process.env.URL_APP;

app.use(cors({ methods: ["GET", "POST"] }));
app.use(express.json());



const bot = new Telegraf(process.env.TOKEN);

bot.use(
  session({
    defaultSession: () => ({ write_user: false, write_admin: false, order_scena: false })
  })
);

// defaultSession: () => ({ write_admin: false }),
// defaultSession: () => ({ order_scena: false }),


bot.telegram.setMyCommands(commands);


const SUBS = { };

async function updateSubs(){
  const res = await subsBase.find({}).toArray();
  res.forEach((item) => {
    SUBS[item.title] = item;
  });
}
updateSubs();













//Сцены


const writeHelp = new Scenes.WizardScene(
  "write_help",
  (ctx) => {
    ctx.session.write_user = true;
    ctx.reply(
      "<b>Можете задать любой вопрос, если возникли трудности. Также можно прикрепить фото.</b>",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Отменить", callback_data: "cancel_write_help" }],
          ],
        },
      }
    );
    return ctx.wizard.next();
  },
  (ctx) => {
    const { id, username } = ctx.from;

    if (
      (ctx.callbackQuery?.data === "help" && ctx.session.write_user) ||
      ctx.callbackQuery?.data === "cancel_write_user_help" ||
      ctx.callbackQuery?.data === "cancel_write_help"
    ) {
      ctx.session.write_user = false;
      ctx.deleteMessage();
      return ctx.scene.leave();
    }

    ctx.session.write_user = false;

    if (ctx.update.message.photo) {
      const photo = ctx.update.message.photo.pop();
      ctx.telegram.sendPhoto(ADMIN_ID, photo.file_id, {
        caption: `<b>Пользователь: @${username}</b> \n <blockquote>${
          ctx.update.message.caption ?? "Пусто"
        }</blockquote>`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "Ответить", callback_data: `user_${id}_${username}` }],
          ],
        },
      });
    } else {
      ctx.telegram.sendMessage(
        ADMIN_ID,
        `<b>Пользователь: @${username}</b> > \n <blockquote>${ctx.message.text}</blockquote>`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "Ответить", callback_data: `user_${id}_${username}` }],
            ],
          },
        }
      );
    }
    ctx.reply(`✅ <b>Готово! Ваша заявка будет расмотренна.</b>`, {
      parse_mode: "HTML",
    });
    return ctx.scene.leave();
  }
);

const writeHelpAdmin = new Scenes.WizardScene(
  "write_help_admin",
  (ctx) => {
    const { id, username } = ctx.scene.state;
    ctx.session.write_admin = true;
    ctx.reply(`<b>Отвечаем > @${username}</b>`, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "❌ Отменить", callback_data: "cancel_write_user_help" }],
        ],
      },
    });
    return ctx.wizard.next();
  },
  (ctx) => {
    const { id, username } = ctx.scene.state;

    if (ctx.callbackQuery?.data.startsWith("user") && ctx.session.write_admin) {
      ctx.session.write_admin = false;
      return ctx.scene.leave();
    }

    if (
      ctx.callbackQuery?.data === "cancel_write_user_help" ||
      ctx.callbackQuery?.data === "cancel_write_help"
    ) {
      ctx.session.write_admin = false;
      ctx.deleteMessage();
      return ctx.scene.leave();
    }
    ctx.session.write_admin = false;

    if (ctx.update.message.photo) {
      const photo = ctx.update.message.photo.pop();
      ctx.telegram.sendPhoto(id, photo.file_id, {
        caption: `🔔 <b>Ответ Поддержки</b> >
        \n<blockquote>${ctx.update.message.caption ?? "Пусто"}</blockquote>`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "💻 Написать ещё", callback_data: `help` }],
          ],
        },
      });
    } else {
      ctx.telegram.sendMessage(
        id,
        `🔔 <b>Ответ Поддержки</b> > \n <blockquote>${ctx.message.text}</blockquote>`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "💻 Написать ещё", callback_data: `help` }],
            ],
          },
        }
      );
    }
    ctx.reply(`✅ <b>Готово! Ответ отправлен.</b>`, { parse_mode: "HTML" });
    return ctx.scene.leave();
  }
);


const stage = new Scenes.Stage([writeHelp, writeHelpAdmin ]);
bot.use(stage.middleware());







// Действия по нажатию inline кнопки
bot.action(/^user/i, async (ctx) => {
  if (!ctx.session.write_admin) {
    ctx.session.write_admin = false;
    const [, id, username] = ctx.match.input.split("_");
    ctx.scene.enter("write_help_admin", { id, username });
  }
});

bot.action(/^status_order_/i, async (ctx) => {
  const [,, order] = ctx.match.input.split("_");
  axios(`https://optsmm.ru/api/v2?action=status&order=${order}&key=${OPTSMM_KEY}`)
  .then(optsmm => {
    console.log(optsmm.data);
    ctx.reply(`<b>👁️ Статус Заказа: </b>    
<blockquote>🔄 Статус: ${optsmm.data.status}</blockquote>
<blockquote>⏳ Осталось: ${(optsmm.data.remains*1).toLocaleString("ru-RU")}</blockquote>
<blockquote>💰 Заряд: ${(optsmm.data.charge*1.5).toLocaleString("ru-RU")}₽</blockquote>
`,
      {
        parse_mode: "HTML",
      }
    );
  });
  
});





bot.action(/^pay_order_/i, async (ctx) => {
  const id = ctx.from.id;
    const idOrder = ctx.match.input.split("_")[2];
    orderBase.findOne({ id: idOrder }).then(res_0 => {
      if(!res_0.ready){ 
        dataBase.findOne({ id: id }).then(res_1 => {
          if(res_1.balance >= res_0.price){
            axios(`https://optsmm.ru/api/v2?action=add&service=${res_0.service}&link=${res_0.url}&quantity=${res_0.amount}&key=${OPTSMM_KEY}`)
            .then(optsmm => {
              ctx.deleteMessage();
              dataBase.updateOne({ id: id }, { $inc : { balance: -res_0.price }});
              orderBase.updateOne({ id: idOrder }, { $set : { ready: true, order: optsmm.data.order}});
              if(res_1.prefer){
                dataBase.updateOne({ ref_code: res_1.prefer }, { $inc : { balance: res_0.price*0.10 }});
                dataBase.findOne({ ref_code: res_1.prefer }).then(user => {
                  try {
                  bot.telegram.sendMessage(user.id,`<b>🎉 Ваш реферал совершил покупку!</b>
<blockquote><b>💸 Вам начислено:</b> 10% от суммы</blockquote>
<blockquote><b>💰 Сумма вознаграждения:</b> ${(res_0.price*0.10).toFixed(3)}₽</blockquote>
                    `, { parse_mode:'HTML' });
                  }
                  catch(error){
                    console.log(error);
                  }
                })
              

              }
              const currentService = obj.find((item) => item.service == res_0.service);
              ctx.reply(`<b>✅ Заказ оплачен: #${idOrder}</b>
Ожидайте в течение нескольких минут вы получите результат.

<blockquote>Услуга: ${currentService.name}</blockquote>
<blockquote>Ваше колличество: ${res_0.amount.toLocaleString("ru-RU")}</blockquote>
<blockquote>Сумма к списанию: ${res_0.price.toLocaleString("ru-RU")}₽</blockquote>
<blockquote>Сылка: ${res_0.url}</blockquote> `,
                {
                parse_mode: "HTML",
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: "👁️ Статус заказа",
                        callback_data: `status_order_${optsmm.data.order}`,
                      },
                    ],
                  ],
                },
                }
              );
              console.log('Опалата успешно');

            })
            .catch(() => {
              ctx.reply(`<b>❌ Ошибка заказа: #${idOrder}</b>
Если это произошло не первый раз обратитесь в поддержку!
                `,
                {
                  parse_mode: "HTML"
                });
                console.log('Опалата не успешно');
            })
          }
        })
      }
      else{
        console.log('Уже было оплаченно');
      }
    });  
});


bot.action(/^pay_umoney_/i, async (ctx) => {
  const { id, username } = ctx.from;
  
  const amountOrder = ctx.match.input.split("_")[2];

  const currenLable = refCode(10);

  const link = createQuickpayLink({ receiver: "4100119146265962", sum: amountOrder*1, label: currenLable, targets: `Оплата #${currenLable}` });
  orderBase.insertOne( { id, lable: currenLable, amount: amountOrder*1, status: false }).then(() => {
      ctx.reply(`<b>💳 Ссылка на оплату сгенерирована #${currenLable}</b>
<blockquote><b>⚡️ Обратите внимание: сервис удерживает 3% комиссии, но мы покрываем её за вас! </b> </blockquote>`
            ,{  
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [ { text: `Пополнить на ${amountOrder}₽`, url: link } ],
                  [ { text: `Проверить оплату`, callback_data: `umoney_lable_${currenLable}` } ]
                ] 
              }
            });
    })
    


});

bot.action(/^umoney_lable_/i, async (ctx) => {
  const id = ctx.from.id;
  const currenLable = ctx.match.input.split("_")[2];

  //console.log(currenLable);

  const response = await axios.post(
    "https://yoomoney.ru/api/operation-history",
    { label: currenLable }, // фильтруем по вашему label
      {
        headers: {
          Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
  
    const operations = response.data.operations || [];
    if (operations.length === 0) {
      ctx.reply(`<b>❌ Платеж с таким #${currenLable} не найден</b>`, { parse_mode: 'HTML'});
      return false;
    }
  
    const payment = operations[0]; // последний платёж с этим label
    if (payment.status === "success") {
      //console.log(payment)
      await ctx.deleteMessage();
     
      orderBase.findOne({ lable: currenLable }).then(async (order) => {
        ctx.reply(`<b>✅ Оплата подтверждена #${currenLable}</b>
<blockquote>Cумма пополнения: <b>${order.amount}₽</b></blockquote>`, { parse_mode: 'HTML'});
        await orderBase.updateOne({ lable: currenLable }, { $set: { status: true } });
        await dataBase.updateOne({ id: order.id }, { $inc: { balance: order.amount*1 } });
        //new code
        const userPay = await dataBase.findOne({ id: order.id });
        if(userPay.prefer){
          const userMain = await dataBase.findOne({ ref_code: userPay.prefer });
          await dataBase.updateOne({ ref_code: userPay.prefer }, { $inc: { balance: (order.amount*1)*(userMain.percent_ref/100) } });
        }
        
      });
      return true;
    } else {
      ctx.reply("⏳ Платёж ещё не завершён");
      return false;
    }
  

});


bot.action(/^pay_crypto_/i, async (ctx) => {
  const { id } = ctx.from;
 
  const amountOrder = ctx.match.input.split("_")[2];
  console.log(amountOrder)

  axios.post(`https://pay.crypt.bot/api/createInvoice`,
    {
      currency_type: "fiat", 
      fiat: "RUB",           
      amount: amountOrder,       
      accepted_assets: "USDT",
      description: `Пополнение баланса на ${amountOrder}₽`
    },
    {
      headers: {
        "Crypto-Pay-API-Token": process.env.TOKEN_CRYPTO,
      },
    }
  ).then(res => {
    const { invoice_id, amount, created_at, bot_invoice_url } = res.data.result;

    orderBase.insertOne( { invoice_id, amount, created_at, bot_invoice_url, id }).then(res_2 => {
      ctx.reply(`<b>💳 Ссылка на оплату сгенерирована!</b>
<blockquote><b>⚡️ Обратите внимание: сервис удерживает 3% комиссии, но мы покрываем её за вас! </b> </blockquote>`
            ,{  
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [ { text: `Пополнить на ${amountOrder}₽`, url: bot_invoice_url } ]
                ] 
              }
            });
    })
    
  })

});

 



bot.action("pay_balance", async (ctx) => {
  await ctx.editMessageMedia(
    {
      type: "photo",
      media: "https://i.ibb.co/prjBrKj4/card-up-to-pay.jpg",
      caption: "<b>💸 Это все способы пополнения баланса.</b>",
      parse_mode: "HTML",
    },
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "💳 Карта", callback_data: `pay_umoney` },
            { text: "🧠 Крипта", callback_data: `pay_crypto` },
          ],
          [{ text: "<< Назад", callback_data: `menu_back` }],
        ],
      },
    }
  );
});

bot.action("pay_umoney", async (ctx) => {
  const { id, username } = ctx.from;
  bot.telegram.sendMessage(ADMIN_ID, `<blockquote><b>Пользователь \n id:<code>${id}</code>  @${username}\n Использовал: Пополнения ЮMoney</b></blockquote>`,{ parse_mode:'HTML' })

  await ctx.editMessageMedia(
    {
      type: "photo",
      media: "https://i.ibb.co/kg7GcVmQ/card-yoomoney.jpg",
      caption: "<b>💸 Это пополнения баланса через карту или ЮMoney.</b>",
      parse_mode: "HTML",
    },
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "100₽", callback_data: `pay_umoney_100` },
            { text: "200₽", callback_data: `pay_umoney_150` },
            { text: "400₽", callback_data: `pay_umoney_300` },
            { text: "600₽", callback_data: `pay_umoney_600` },
          ],
          [{ text: "<< Назад", callback_data: `pay_balance` }],
        ],
      },
    }
  );
});
bot.action("pay_crypto", async (ctx) => {
  const { id, username } = ctx.from;
  bot.telegram.sendMessage(ADMIN_ID, `<blockquote><b>Пользователь \n id:<code>${id}</code>  @${username}\n Использовал: Пополнения Крипта</b></blockquote>`,{ parse_mode:'HTML' })

  await ctx.editMessageMedia(
    {
      type: "photo",
      media: "https://i.ibb.co/Y7vhFDm4/card-crypto.jpg",
      caption: "<b>💸 Это пополнения баланса через Крипту.</b>",
      parse_mode: "HTML",
    },
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "200₽", callback_data: `pay_crypto_200` },
            { text: "400₽", callback_data: `pay_crypto_400` },
            { text: "600₽", callback_data: `pay_crypto_600` },
          ],
          [{ text: "<< Назад", callback_data: `pay_balance` }],
        ],
      },
    }
  );
});







bot.action("help", async (ctx) => {
  if (!ctx.session.write_user) {
    ctx.session.write_user = false;
    ctx.scene.enter("write_help");
  }
});

bot.action("menu", async (ctx) => {
 
  ctx.replyWithPhoto("https://i.ibb.co/0VtRR6ts/card-menu-prime-Wave.jpg", {
    caption: `<b>📋 Главное меню</b>
<blockquote>Здесь вы найдёте всё, что нужно для удобной работы с ботом ✨</blockquote>`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📘 Как это работает", callback_data: "how_it_works" }, { text: "🚀 Купить подписку", callback_data: "buy_subscription" }],
        [{ text: "👨 Личный кабинет", callback_data: "my_profile" }],
        [{ text: "💳 Пополнить баланс", callback_data: "pay_balance" }],
        [{ text: "👨‍💻 Поддержка", callback_data: "help" }]
      ]
    },
  });
});

bot.action("menu_back", async (ctx) => {
  await ctx.editMessageMedia(
    {
      type: "photo",
      media: "https://i.ibb.co/0VtRR6ts/card-menu-prime-Wave.jpg",
      caption: `<b>📋 Главное меню</b>
<blockquote>Здесь вы найдёте всё, что нужно для удобной работы с ботом ✨</blockquote>`,
      parse_mode: "HTML",
    },
    {
      reply_markup: {
        inline_keyboard: [
        [{ text: "📘 Как это работает", callback_data: "how_it_works" }, { text: "🚀 Купить подписку", callback_data: "buy_subscription" }],
        [{ text: "👨 Личный кабинет", callback_data: "my_profile" }],
        [{ text: "💳 Пополнить баланс", callback_data: "pay_balance" }],
        [{ text: "👨‍💻 Поддержка", callback_data: "help" }]
        ]
      },
    }
  );
});





// new methods

bot.action("how_it_works", async (ctx) => {
  ctx.editMessageMedia({
    type: "photo",
    media:"https://i.ibb.co/LhRgJzLX/card-how-it-works-prime-Wave.jpg", 
    caption: `<b>Как это работает?</b>

<blockquote><b>После покупки подписки ✨ вы получите полный доступ к функциям бота. Основная работа происходит через наше Мини-приложение внутри Telegram 📱.

Вам нужно будет:

• Авторизоваться через свой аккаунт 🔐
• Выбрать канал, который хотите отслеживать 📡
• Подготовить комментарий, который будет автоматически отправляться ✍️
• (По желанию) Настроить задержку перед отправкой, чтобы всё выглядело максимально естественно ⏱️

После настройки бот начнёт работать полностью автономно — вам останется только наблюдать за результатом 🚀
</b>

</blockquote>`,
    parse_mode: "HTML",
  },
  {
    reply_markup: {
      inline_keyboard: [
        [{ text: "<< Назад", callback_data: "menu_back" }]
      ]
    },
  });
});

bot.action("my_profile", async (ctx) => {
  const { id } = ctx.from;
  const user = await dataBase.findOne({ id });
  const daysSub = Math.ceil((user.activation_sub-dateNow())/864e5);
  ctx.editMessageMedia({
    type: "photo",
    media:"https://i.ibb.co/2789JGYq/card-my-profile-prime-Wave.jpg", 
    caption: `<b>👤 Личный кабинет</b>
<blockquote>🆔 ID: ${ user.id }
💰 Баланс: ${ user.balance } ₽
🔐 Текущая подписка: ${ user.subscription ?? 'Нет' }
📅 Дней подписки осталось: ${ daysSub < 0 ? '0' : daysSub }
👥 Рефералы: ${ user.referrals }
</blockquote>
`,
    parse_mode: "HTML"
    },
    {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🤝 Реферальная система", callback_data: "referral_system" }],
        [{ text: "<< Назад", callback_data: "menu_back" }]
      ]
    },
  });
});


bot.action("referral_system", async (ctx) => {
  const { id } = ctx.from;
  const user = await dataBase.findOne({ id });
  // if(!user.isBanned) return 1;
  const refLink = `https://t.me/primeWave_bot?start=ref_${user.ref_code}`;
  ctx.editMessageMedia({
    type: "photo",
    media:"https://i.ibb.co/2RWjkvS/card-referral-prime-Wave.jpg", 
    caption: `<b>🤝 Реферальная система</b>

<b>🔗 Ваша приглашательная ссылка:</b>
<code>${refLink}</code>

<b>👥 Количество рефералов: ${user.referrals}</b>

<b>💸 Ваш бонус:</b>
<blockquote>Вы получаете ${user.percent_ref}% от каждого пополнения 
баланса, сделанного вашим рефералом.
Зарабатывайте, просто приглашая друзей!</blockquote>`,
    parse_mode: "HTML"
    },
    {
    reply_markup: {
      inline_keyboard: [
        [{ text: "<< Назад", callback_data: "my_profile" }]
      ]
    },
  });
});



bot.action("buy_subscription", async (ctx) => {
  const { id } = ctx.from;
  const user = await dataBase.findOne({ id });
  if(user.subscription){
    const daysSub = Math.ceil((user.activation_sub-dateNow())/864e5);
    ctx.editMessageMedia({
      type: "photo",
      media:"https://i.ibb.co/GfPL935Q/card-subscription-prime-Wave.jpg", 
      caption: `<b>⚠️ У вас уже есть активная подписка</b>
✨ Наслаждайтесь всеми возможностями без ограничений!

<b>🔰 Ваш уровень подписки: ${ user.subscription }</b>

📅 <b>Дней подписки осталось:</b> <code>${ daysSub < 0 ? '0' : daysSub }</code>`,
      parse_mode: "HTML"
    },
    {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📱 Мини-Приложение", web_app: { url: "https://prime-wave-app.vercel.app"  } }],
        [{ text: "❌ Отменить подписку", callback_data: "cancel_subscription" }],
        [{ text: "<< Назад", callback_data: "menu_back" }]
      ]
    },
  });
  }
  else{
    if(!SUBS['1']){
      await updateSubs();
    }
    const arr_keyboard = [];
    for(const name in SUBS){
      const item = SUBS[name];
      arr_keyboard.push([{ text: `🌟 Уровень ${ item.title } - ${ item.price }₽`, callback_data: `subscription_level_${item.title}` }]);
    }
    arr_keyboard.push([{ text: "<< Назад", callback_data: "menu_back" }]);


    ctx.editMessageMedia({
      type: "photo",
      media:"https://i.ibb.co/GfPL935Q/card-subscription-prime-Wave.jpg", 
      caption: `<b>🎟 Здесь представлены все доступные уровни подписок.</b>

<b>💰 Ваш баланс:</b> <code>${user.balance}₽</code>`,
      parse_mode: "HTML"
    },
    {
    reply_markup: {
      inline_keyboard: arr_keyboard
    },
  });
  }
});



bot.action(/^subscription_level_/i, async (ctx) => {
  const { id } = ctx.from;
  const level = ctx.match.input.split("subscription_level_")[1];
  const item = SUBS[level];


  ctx.editMessageMedia({
    type: "photo",
    media:"https://i.ibb.co/GfPL935Q/card-subscription-prime-Wave.jpg", 
    caption: `<b>🌟 Уровень ${item.title} — ${item.price}₽/неделя</b>

<b>Что даёт:</b>
<blockquote><b>👤 ${item.description}</b>
🔐 Авторизация ${item.max_accounts} аккаунта
📡 Отслеживание до ${item.max_posts} каналов
💬 До ${item.max_posts} заранее сохранённых комментариев
⏱️ Настройка задержки перед отправкой</blockquote>
`,
    parse_mode: "HTML"
    },
    {
    reply_markup: {
      inline_keyboard: [
        [{ text: "💳 Купить", callback_data: `buy_subscription_level_${level}` }],  
        [{ text: "<< Назад", callback_data: "buy_subscription" }]
      ]
    },
  });




});


bot.action("cancel_subscription", async (ctx) => {
  const { id } = ctx.from;
  const user = await dataBase.findOne({ id });

  const daysSub = Math.floor((user.activation_sub-dateNow())/864e5);
  const moneyBack = Math.floor((SUBS[user.subscription].price/7)*daysSub);

  await dataBase.updateOne({ id }, { $set: { activation_sub: 0,  subscription: null } });
  dataBase.updateOne({ id: user.id }, { $inc: { balance: (moneyBack*1) } });
  axios.post(`${URL_APP}/api/suspend-user`,  { id }, { headers: { "Content-Type": "application/json" } });
  bot.telegram.sendMessage(id, `<b>Вы отменили подписку!</b>\n<blockquote><b>🔰 Ваш уровень подписки был: ${ user.subscription }</b>\n<b>💸 Вам было возвращенно: ${moneyBack}₽</b></blockquote>`, { parse_mode: "HTML" });

  // dataBase.updateOne({ id: user.id }, { $inc: { balance: (SUBS[user.subscription].price*-1) } });

  //  user.subscription

  // SUBS[user.subscription].price/7


  await ctx.editMessageMedia(
    {
      type: "photo",
      media: "https://i.ibb.co/0VtRR6ts/card-menu-prime-Wave.jpg",
      caption: `<b>📋 Главное меню</b>
<blockquote>Здесь вы найдёте всё, что нужно для удобной работы с ботом ✨</blockquote>`,
      parse_mode: "HTML",
    },
    {
      reply_markup: {
        inline_keyboard: [
        [{ text: "📘 Как это работает", callback_data: "how_it_works" }, { text: "🚀 Купить подписку", callback_data: "buy_subscription" }],
        [{ text: "👨 Личный кабинет", callback_data: "my_profile" }],
        [{ text: "💳 Пополнить баланс", callback_data: "pay_balance" }],
        [{ text: "👨‍💻 Поддержка", callback_data: "help" }]
        ]
      },
    }
  );



});


bot.action(/^buy_subscription_level_/i, async (ctx) => {
  const { id } = ctx.from;
  const level = ctx.match.input.split("buy_subscription_level_")[1];
  const item = SUBS[level];
  //864e5*7
  const user = await dataBase.findOne({ id });
  if(user.balance >= item.price && !user.subscription){
    await dataBase.updateOne({ id }, { $set: { subscription: level, activation_sub: (dateNow()+864e5*7) } });
    await dataBase.updateOne({ id }, { $inc: { balance: (item.price*-1) } });
    axios.post(`${URL_APP}/api/restore-user`,  { id: user.id }, { headers: { "Content-Type": "application/json" } });

    ctx.editMessageMedia({
      type: "photo",
      media:"https://i.ibb.co/GfPL935Q/card-subscription-prime-Wave.jpg", 
      caption: `<b>🎉 Подписка оформлена!</b>

<b>🔰 Ваш уровень подписки: ${ level }</b>

Спасибо, что выбрали <b>PrimeWave</b> 🌟
Ваша подписка успешно активирована — теперь вам доступны расширенные возможности и автоматическая отправка комментариев.
  `,
      parse_mode: "HTML"
      },
      {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📱 Мини-Приложение", web_app: { url: "https://prime-wave-app.vercel.app"  } }],
          [{ text: "❌ Отменить подписку", callback_data: "cancel_subscription" }],
          [{ text: "<< Назад", callback_data: "menu_back" }]
        ]
      },
    });
  }
  else if(user.balance < item.price){
    ctx.editMessageMedia({
      type: "photo",
      media:"https://i.ibb.co/GfPL935Q/card-subscription-prime-Wave.jpg", 
      caption: `<b>⚠️ Недостаточно средств</b>

К сожалению, на вашем балансе недостаточно средств для оформления подписки 💳
Пополните баланс, чтобы продолжить.

<b>💰 Ваш баланс:</b> <code>${user.balance}₽</code>
`,
      parse_mode: "HTML"
      },
      {
      reply_markup: {
        inline_keyboard: [
          [{ text: "💳 Пополнить баланс", callback_data: "pay_balance" }],
          [{ text: "<< Назад", callback_data: "buy_subscription" }]
        ]
      },
    });

  }

});













// Комманды
bot.command("start", async (ctx) => {
  const { id, first_name, username } = ctx.from;
  const refHashRaw = ctx.payload;

  console.log(refHashRaw);
  bot.telegram.sendMessage(ADMIN_ID, `<blockquote><b>Пользователь добавился:\n id:<code>${id}</code>  @${username}</b></blockquote>`,{ parse_mode:'HTML' })

  dataBase.findOne({ id }).then(async (res) => {
    if (!res) {
      dataBase.insertOne({
        id, first_name, username, referrals: 0, isBanned: false, isValid: true, 
        percent_ref: 20,
        ref_code: refCode(), id_hash: refCode(),
        subscription: null,  activation_sub: 0,
        prefer: refHashRaw ? refHashRaw.split("_")[1] : 0 , date: dateNow(), balance: 0
      });
      if (refHashRaw) {
        const refHash = refHashRaw.split("_")[1];
        dataBase.updateOne({ ref_code: refHash }, { $inc: { referrals: 1 } });
      }
    }
  });

  ctx.replyWithPhoto("https://i.ibb.co/ccPD5CRD/card-standart-prime-Wave.jpg", {
    caption: `<b>⚡ Добро пожаловать в PrimeWave</b>
<blockquote><b>Я мониторю выбранные каналы и автоматически оставляю комментарий первым — быстро, точно и без задержек.</b></blockquote>
`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📲 Перейти в меню", callback_data: `menu` }],
      ],
    },
  });
});

bot.command("menu", async (ctx) => {
  await ctx.deleteMessage();
  ctx.replyWithPhoto("https://i.ibb.co/0VtRR6ts/card-menu-prime-Wave.jpg", {
    caption: `<b>📋 Главное меню</b>
<blockquote>Здесь вы найдёте всё, что нужно для удобной работы с ботом ✨</blockquote>`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📘 Как это работает", callback_data: "how_it_works" }, { text: "🚀 Купить подписку", callback_data: "buy_subscription" }],
        [{ text: "👨 Личный кабинет", callback_data: "my_profile" }],
        [{ text: "💳 Пополнить баланс", callback_data: "pay_balance" }],
        [{ text: "👨‍💻 Поддержка", callback_data: "help" }]
      ]
    },
  });
});

bot.command("help", async (ctx) => {
  if (!ctx.session.write_user) {
    ctx.session.write_user = false;
    ctx.scene.enter("write_help");
  }
});













// Дополнительный функционал
function refCode(n = 6) {
  const symbols = "QWERTYUIOPASDFGHJKLZXCVBNMqwertyuiopasdfghjklzxcvbnm1234567890";
  let user_hash = "";
  for (let i = 0; i != n; i++) { user_hash += symbols[Math.floor(Math.random() * symbols.length)]; }
  return user_hash;
}

function createQuickpayLink({ receiver, sum, label, targets, paymentType = "AC" }) {
  const params = querystring.stringify({ receiver, "quickpay-form": "shop", targets, paymentType, sum, label });
  return `https://yoomoney.ru/quickpay/confirm.xml?${params}`;
}

function dateNow() {
  return new Date().getTime();
}







// Express API
app.post("/send-user", async (req, res) => {
  const { id, msg } = req.body;
  try {
  await bot.telegram.sendMessage(id, msg, { parse_mode: 'HTML'})
  res.send({ type: 200 });
  }
  catch(error){
    if (error.response && error.response.error_code === 403) {
      console.log(`Пользователь ${id} заблокировал бота`);
    } else {
      console.error("Ошибка при отправке:", error);
    }
    res.send({ type: 404 });
  }
});
app.post('/send-ref', async (req, res) => {
  const { id } = req.body;
  console.log(id);
  dataBase.findOne({ id }).then(async (user) => {
    if(user){
    const refLink = `https://t.me/${user.username}?start=ref_${user.ref_code}`;
    try {
      await bot.telegram.sendPhoto(id, "https://i.postimg.cc/xTKMSXYY/card-refferals.jpg" ,{ caption:`<b>🔗 Ваша реферальная ссылка</b>
    
<code>${refLink}</code>

<blockquote><b>Приглашайте друзей и получайте +10% от каждой их покупки</b> 💸
Чем больше друзей — тем больше бонусов! 🎁</blockquote>`,
       parse_mode: "HTML" }
      );
      res.send({ type: 200 });
   }
   catch(error){
    if (error.response && error.response.error_code === 403) {
      console.log(`Пользователь ${id} заблокировал бота`);
      // можно удалить chatId из базы
    } else {
      console.error("Ошибка при отправке:", error);
      
    }
    res.send({ type: 404 });
   }
  }
  else{
    res.send({ type: 404 });
  }
  });
});
app.get("/sleep", async (req, res) => {
  res.send({ type: 200 });
});

// Express Telegram API
app.post("/telegram/send-text", async (req, res) => {
  const { id, text } = req.body;
  try {
    await bot.telegram.sendMessage(id, text, { parse_mode: 'HTML'});
    res.json({ type: 200 });
  }
  catch(error){
    if (error.response && error.response.error_code === 403) {
      console.log(`Пользователь ${id} заблокировал бота`);
    } else {
      console.error("Ошибка при отправке:", error);
    }
    res.json({ type: 500 });
  }
}); 

app.post("/telegram/send-photo", async (req, res) => {
  const { id, text, image } = req.body;
  try {
    await bot.telegram.sendPhoto(id, image, { caption: text,  parse_mode: 'HTML'})
    res.json({ type: 200 });
  }
  catch(error){
    if (error.response && error.response.error_code === 403) {
      console.log(`Пользователь ${id} заблокировал бота`);
    } else {
      console.error("Ошибка при отправке:", error);
    }
    res.json({ type: 500 });
  }
}); 




// Проверка подписки
async function checkSubscription() {
  const USERS = await dataBase.find({}).toArray();
  const CURRENT_TIME = dateNow();
  if(!SUBS['1']){
    await updateSubs();
  }

  // 864e5*7
  USERS.forEach((user) => {
    if(user.subscription && (user.activation_sub - CURRENT_TIME) < 0){
      if(user.balance >= SUBS[user.subscription].price ){
        dataBase.updateOne({ id: user.id }, { $set: { activation_sub: CURRENT_TIME+864e5*7 } });
        dataBase.updateOne({ id: user.id }, { $inc: { balance: (SUBS[user.subscription].price*-1) } });
        bot.telegram.sendMessage(user.id, `<b>Подписка была продлена автоматически</b> \n <blockquote><b>🔰 Ваш уровень подписки: ${ user.subscription }</b> </blockquote>`, { parse_mode: "HTML" });
      }
      else{
        dataBase.updateOne({ id: user.id }, { $set: { activation_sub: 0,  subscription: null } });
        axios.post(`${URL_APP}/api/suspend-user`,  { id: user.id }, { headers: { "Content-Type": "application/json" } });
        

        bot.telegram.sendMessage(user.id, `<b>Подписка не была продленна на вашем счету мало средств</b> \n <blockquote><b>🔰 Ваш уровень подписки был: ${ user.subscription }</b> </blockquote>`, { parse_mode: "HTML" });

      }
    }
  });
}
checkSubscription();
setInterval(checkSubscription, 60000*0.5);
//60000*30

// WebHook Crypto Api
app.post("/pay", async (req, res) => {
  const update = req.body;
  if (update.update_type === "invoice_paid") {
    const invoice = update.payload;
    const currentAmount = update.payload.amount * 1;

    orderBase.findOne({ invoice_id: invoice.invoice_id }).then(async (res_2) => {
      if (res_2) {
        await dataBase.updateOne({ id: res_2.id }, { $inc: { balance: currentAmount } });

        // new code
        const userPay = await dataBase.findOne({ id: res_2.id });
        if(userPay.prefer){
          const userMain = await dataBase.findOne({ ref_code: userPay.prefer });
          await dataBase.updateOne({ ref_code: userPay.prefer }, { $inc: { balance: currentAmount*(userMain.percent_ref/100) } });
        }

        bot.telegram.sendMessage(res_2.id, `<b>🎉 Ваш чек #${invoice.invoice_id}</b>
<blockquote><b>💸 Вам начисленно:</b> ${currentAmount}₽</blockquote>`, { parse_mode: "HTML" });
      }
    });
  }

  res.send({ message: "Hello World" });
});


bot.launch();
app.listen(3000, (err) => {
  err ? err : console.log("STARTED SERVER");
});


