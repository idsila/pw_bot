require("dotenv").config();

const commands = require("./commands.js");
const dataBase = require("./dataBase.js");
const orderBase = require("./orderBase.js");

const { Telegraf, session, Scenes } = require("telegraf");
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();
const querystring = require("querystring");
const fs = require("fs");

// Переменные для работы
const ADMIN_ID = process.env.ADMIN_ID;









app.use(cors({ methods: ["GET", "POST"] }));
app.use(express.json());



const bot = new Telegraf(process.env.TOKEN);

bot.use(
  session({
    defaultSession: () => ({ write_user: false }),
    defaultSession: () => ({ write_admin: false }),
    defaultSession: () => ({ order_scena: false }),
  })
);





bot.telegram.setMyCommands(commands);



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
        caption: `🔔 <b>Ответ Администратора</b> >
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
        `🔔 <b>Ответ Администратора</b> > \n <blockquote>${ctx.message.text}</blockquote>`,
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


    orderBase.insertOne( { id, lable: currenLable, amount: amountOrder*1, status: false }).then(res_2 => {
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

  console.log(currenLable);

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
      console.log(payment)
      await ctx.deleteMessage();
     
      orderBase.findOne({ lable: currenLable }).then(async (order) => {
        ctx.reply(`<b>✅ Оплата подтверждена #${currenLable}</b>
<blockquote>Cумма пополнения: <b>${order.amount}₽</b></blockquote>`, { parse_mode: 'HTML'});
        orderBase.updateOne({ lable: currenLable }, { $set: { status: true } });
        dataBase.updateOne({ id: order.id }, { $inc: { balance: order.amount*1 } });
      });
      return true;
    } else {
      ctx.reply("⏳ Платёж ещё не завершён");
      return false;
    }
  

});


bot.action(/^pay_crypto_/i, async (ctx) => {
  const { id, username } = ctx.from;
 
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






bot.action("how_it_works", async (ctx) => {
 
  ctx.replyWithPhoto("https://i.ibb.co/0VtRR6ts/card-menu-prime-Wave.jpg", {
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

bot.action("help", async (ctx) => {
  if (!ctx.session.write_user) {
    ctx.session.write_user = false;
    ctx.scene.enter("write_help");
  }
});

bot.action("menu", async (ctx) => {
 
  ctx.replyWithPhoto("https://i.ibb.co/0VtRR6ts/card-menu-prime-Wave.jpg", {
    caption: "<blockquote><b>Это меню бота  здесь вы найдете то что вам нужно.</b></blockquote>",
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
      caption: "<blockquote><b>Это меню бота  здесь вы найдете то что вам нужно.</b></blockquote>",
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

bot.action("pay_balance", async (ctx) => {
  const { id, username } = ctx.from;
  bot.telegram.sendMessage(ADMIN_ID, `<blockquote><b>Пользователь \n id:<code>${id}</code>  @${username}\n Использовал: Способы пополнения </b></blockquote>`,{ parse_mode:'HTML' })

  await ctx.editMessageMedia(
    {
      type: "photo",
      media: "https://i.ibb.co/tTQ574gv/card-1002.jpg",
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
      media: "https://i.ibb.co/fbWNWJY/card-1003.jpg",
      caption: "<b>💸 Это пополнения баланса через карту или ЮMoney.</b>",
      parse_mode: "HTML",
    },
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "50₽", callback_data: `pay_umoney_50` },
            { text: "100₽", callback_data: `pay_umoney_100` },
            { text: "150₽", callback_data: `pay_umoney_150` },
          ],
          [
            { text: "200₽", callback_data: `pay_umoney_200` },
            { text: "250₽", callback_data: `pay_umoney_250` },
            { text: "300₽", callback_data: `pay_umoney_300` },
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
      media: "https://i.ibb.co/JRwY2T6L/card-1004.jpg",
      caption: "<b>💸 Это пополнения баланса через Крипту.</b>",
      parse_mode: "HTML",
    },
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "100₽", callback_data: `pay_crypto_100` },
            { text: "200₽", callback_data: `pay_crypto_200` },
            { text: "300₽", callback_data: `pay_crypto_300` },
          ],
          [
            { text: "500₽", callback_data: `pay_crypto_500` },
            { text: "1000₽", callback_data: `pay_crypto_1000` },
            { text: "5000₽", callback_data: `pay_crypto_5000` },
          ],
          [{ text: "<< Назад", callback_data: `pay_balance` }],
        ],
      },
    }
  );
});


bot.action("get_bonus", async (ctx) => {
  await ctx.deleteMessage();
  dataBase.findOne({ id: ctx.from.id}).then(user => {
    if(user.bonus){
      console.log(user.bonus)
      if (!ctx.session.order_scena) {
        ctx.session.order_scena = false;
        ctx.scene.enter("bonus_order");
      }
    }
    else{
      const { id } = ctx.from;

ctx.replyWithPhoto("https://i.ibb.co/0jmGR3S4/card-1000.jpg", {
    caption: ` <b>🔒 Бонус использован!</b>

<blockquote><b>Вы уже получили свои 100 бесплатных подписчиков 👥</b>
Продолжайте раскручивать канал — впереди ещё больше возможностей 🚀
</blockquote>
  
`,
    parse_mode: "HTML",
    reply_markup: {
      keyboard: [
        [{ text: "🗂️ Меню", callback_data: `menu` }],
        [{ text: "👨 Личный кабинет", callback_data: `translate` }],
        [{ text: "👨‍💻 Задать вопрос", callback_data: `help` }],
 ],
    },
  });
    }

  });
});


// new methods
bot.action("my_profile", async (ctx) => {
  const { id } = ctx.from;
  const user = await dataBase.findOne({ id });
  //const refLink = `https://t.me/primeWave_bot?start=ref_${user.ref_code}`;
  ctx.editMessageMedia({
    type: "photo",
    media:"https://i.ibb.co/0VtRR6ts/card-menu-prime-Wave.jpg", 
    caption: `<b>👤 Личный кабинет</b>
<blockquote>🆔 ID: ${user.id}
💰 Баланс: ${user.balance}₽
🔐 Текущая подписка: нет
👥 Рефералы: ${user.referrals}
</blockquote>
`,
    parse_mode: "HTML"
    },
    {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🤝 Реферальная система", callback_data: "referral_system" }],
        [{ text: "Назад", callback_data: "menu_back" }]
      ]
    },
  });
});


bot.action("referral_system", async (ctx) => {
  const { id } = ctx.from;
  const user = await dataBase.findOne({ id });
  const refLink = `https://t.me/primeWave_bot?start=ref_${user.ref_code}`;
  ctx.editMessageMedia({
    type: "photo",
    media:"https://i.ibb.co/0VtRR6ts/card-menu-prime-Wave.jpg", 
    caption: `<b>🤝 Реферальная система</b>

<b>🔗 Ваша приглашательная ссылка:</b>
<code>${refLink}</code>

<b>👥 Количество рефералов: ${user.referrals}</b>

<b>💸 Ваш бонус:</b>
<blockquote>Вы получаете 20% от каждого пополнения 
баланса, сделанного вашим рефералом.
Зарабатывайте, просто приглашая друзей!</blockquote>`,
    parse_mode: "HTML"
    },
    {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Назад", callback_data: "my_profile" }]
      ]
    },
  });
});



bot.action("buy_subscription", async (ctx) => {
  const { id } = ctx.from;
  const user = await dataBase.findOne({ id });
  const refLink = `https://t.me/primeWave_bot?start=ref_${user.ref_code}`;
  ctx.editMessageMedia({
    type: "photo",
    media:"https://i.ibb.co/0VtRR6ts/card-menu-prime-Wave.jpg", 
    caption: `<b>Подписки</b>

<blockquote>💰 Баланс: ${user.balance}₽</blockquote>

<blockquote>Здесь все представленные подписки. Чем выше уровень тем больше возможностей.</blockquote>`,
    parse_mode: "HTML"
    },
    {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🌟 Уровень 1", callback_data: "subscription_level_1" }],
        [{ text: "🌟 Уровень 2", callback_data: "subscription_level_2" }],
        [{ text: "🌟 Уровень 3", callback_data: "subscription_level_3" }],
          
        [{ text: "Назад", callback_data: "menu_back" }]
      ]
    },
  });
});
























// Действия по нажатию кнопки из keyboard









// Комманды
//https://i.ibb.co/ccPD5CRD/card-standart-prime-Wave.jpg
//https://i.ibb.co/nMM0hHvP/card-start-prime-Wave.jpg
bot.command("start", async (ctx) => {
  const { id, first_name, username, language_code } = ctx.from;
  console.log(id, first_name, username);
  const refHashRaw = ctx.payload;

  console.log(refHashRaw);
  bot.telegram.sendMessage(ADMIN_ID, `<blockquote><b>Пользователь добавился:\n id:<code>${id}</code>  @${username}</b></blockquote>`,{ parse_mode:'HTML' })

  dataBase.findOne({ id, first_name, username }).then(async (res) => {
    if (!res) {
      console.log("Запись  создаеться");
      dataBase.insertOne({
        id,
        first_name,
        username,
        referrals: 0,
        isBanned: false,
        ref_code: refCode(),
        prefer: refHashRaw ? refHashRaw.split("_")[1] : 0 ,
        date: dateNow(),
        balance: 0,
      });
      if (refHashRaw) {
        const refHash = refHashRaw.split("_")[1];
        dataBase.updateOne({ ref_code: refHash }, { $inc: { referrals: 1 } });
      }
    } else {
      console.log("Запись уже создана");
    }
  });

  ctx.replyWithPhoto("https://i.ibb.co/ccPD5CRD/card-standart-prime-Wave.jpg", {
    caption: `<b>⚡ Добро пожаловать в PrimeWave</b>
<blockquote><b>Я мониторю выбранные каналы и автоматически оставляю комментарий первым — быстро, точно и без задержек.</b></blockquote>
`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "Продолжить", callback_data: `menu` }],
      ],
    },
  });
});

bot.command("ref", async (ctx) => {
  const { id, username } = ctx.from;
  bot.telegram.sendMessage(ADMIN_ID, `<blockquote><b>Пользователь \n id:<code>${id}</code>  @${username}\n Использовал: /ref</b></blockquote>`,{ parse_mode:'HTML' })


  dataBase.findOne({ id }).then(async (res) => {
    const refLink = `https://t.me/${ctx.botInfo.username}?start=ref_${res.ref_code}`;
    await ctx.replyWithPhoto("https://i.postimg.cc/xTKMSXYY/card-refferals.jpg" ,{ caption:`<b>🔗 Ваша реферальная ссылка</b>
    
<code>${refLink}</code>

<blockquote><b>Приглашайте друзей и получайте +10% от каждой их покупки</b> 💸
Чем больше друзей — тем больше бонусов! 🎁</blockquote>`,
       parse_mode: "HTML" }
    );
  });
});





bot.command("menu", async (ctx) => {
  const { id, username } = ctx.from;
  bot.telegram.sendMessage(ADMIN_ID, `<blockquote><b>Пользователь \n id:<code>${id}</code>  @${username}\n Использовал: /menu</b></blockquote>`,{ parse_mode:'HTML' })

  await ctx.deleteMessage();
  await ctx.replyWithPhoto("https://i.ibb.co/qYJqZjqG/card-1001.jpg", {
    caption: "<blockquote><b>Выберите один из представленных товаров.</b></blockquote>",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✨ Подписчики", callback_data: `buy_followers` },
          { text: "👀 Просмотры", callback_data: `buy_views` },
        ],
        [
          { text: "❤️ Реакции", callback_data: `buy_reactions` },
          { text: "☄️ Буст Канала", callback_data: `buy_boosts` },
        ],
        [{ text: "⭐ Звезды", callback_data: `buy_stars` }],
        [{ text: "💳 Пополнить баланс", callback_data: `pay_balance` }],
        [{ text: "👨‍💻 Задать вопрос", callback_data: `help` }],
      ],
    },
  });
});





bot.command("drop", async (ctx) => {
  dataBase.deleteMany({});
  ctx.reply("DROP COLLECTION");
});
bot.command("drops", async (ctx) => {
  orderBase.deleteMany({});
  ctx.reply("DROP COLLECTION");
});



bot.command("help", async (ctx) => {
  if (!ctx.session.write_user) {
    ctx.session.write_user = false;
    ctx.scene.enter("write_help");
  }
});








bot.launch();






// Дополнительный функционал

function refCode(n = 6) {
  const symbols = "QWERTYUIOPASDFGHJKLZXCVBNMqwertyuiopasdfghjklzxcvbnm1234567890";
  let user_hash = "";
  for (let i = 0; i != n; i++) {
    user_hash += symbols[Math.floor(Math.random() * symbols.length)];
  }
  return user_hash;
}

function createQuickpayLink({ receiver, sum, label, targets, paymentType = "AC" }) {
  const params = querystring.stringify({
    receiver,
    "quickpay-form": "shop",
    targets,
    paymentType,
    sum,
    label
  });

  return `https://yoomoney.ru/quickpay/confirm.xml?${params}`;
}

function dateNow() {
  return new Date().getTime();
}



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



app.listen(3000, (err) => {
  err ? err : console.log("STARTED SERVER");
});
