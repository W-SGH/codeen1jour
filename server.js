require("dotenv").config();
const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");

const app = express();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // pour test sur Render

app.post(
  "/webhook",
  bodyParser.raw({ type: "application/json" }),
  (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("❌ Erreur vérification webhook:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log("✅ Webhook reçu :", event.type);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const email = session.metadata.email || "";
      const prenom = session.metadata.prenom || "";
      const nom = session.metadata.nom || "";
      const date = new Date().toISOString();

      const visioURL = `https://meet.jit.si/codeen1jour-${Date.now()}`;
      const ligne = `"${prenom}","${nom}","${email}","${date}","${visioURL}"\n`;

      fs.appendFile("inscriptions.csv", ligne, (err) => {
        if (err) console.error("Erreur CSV:", err);
        else console.log("✅ Inscription enregistrée dans CSV.");
      });

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        logger: true,
        debug: true,
      });

      // Mail à l'élève
      const messageEleve = `
Bonjour ${prenom},

Merci pour ton inscription à la formation *Code en 1 jour* !

📅 Voici ton lien unique pour rejoindre la classe en visio :
👉 ${visioURL}

Pense à te connecter 5 minutes avant le début du cours.

À très bientôt !
L'équipe BHS Permis
`;

      transporter.sendMail(
        {
          from: `"BHS Permis" <${process.env.SMTP_USER}>`,
          to: email,
          subject: "Ton lien visio - Formation Code en 1 jour",
          text: messageEleve,
        },
        (err, info) => {
          if (err) console.error("❌ Erreur envoi mail élève:", err);
          else console.log("📩 Mail élève envoyé :", info.response);
        }
      );

      // Mail admin
      transporter.sendMail(
        {
          from: `"BHS Permis" <${process.env.SMTP_USER}>`,
          to: process.env.SMTP_USER,
          subject: "Nouvelle inscription",
          html: `<p>Nouvelle inscription :</p><ul><li>Prénom : ${prenom}</li><li>Nom : ${nom}</li><li>Email : ${email}</li><li>Lien visio : <a href="${visioURL}">${visioURL}</a></li></ul>`,
        },
        (err, info) => {
          if (err) console.error("❌ Erreur envoi mail admin:", err);
          else console.log("📩 Mail admin envoyé :", info.response);
        }
      );
    }

    res.status(200).send("OK");
  }
);

app.use(express.json());
app.use(express.static("public"));

app.post("/create-checkout-session", async (req, res) => {
  try {
    const { email, nom, prenom } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: 3000,
            product_data: { name: "Formation Code en 1 Jour" },
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.BASE_URL}/success.html`,
      cancel_url: `${process.env.BASE_URL}/cancel.html`,
      metadata: { email, nom, prenom },
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error("Erreur Stripe:", error.message);
    res.status(500).json({ error: "Erreur de paiement" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✅ Serveur lancé sur le port ${port}`));
