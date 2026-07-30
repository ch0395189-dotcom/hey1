import { motion } from "framer-motion";
import promoVideo from "@/assets/heyhey-promo.mp4.asset.json";
import promoPoster from "@/assets/heyhey-promo-poster.jpg.asset.json";

const DemoVideo = () => {
  return (
    <section id="demo" className="py-12 md:py-24 scroll-mt-20">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-6 md:mb-10"
        >
          <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold mb-3 md:mb-4">
            Mira <span className="text-gradient">Hey Hey</span> en acción
          </h2>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto px-4">
            Un vistazo rápido a la bandeja unificada, el chatbot y los envíos masivos.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="max-w-4xl mx-auto rounded-2xl md:rounded-3xl overflow-hidden border border-border shadow-elevated bg-card"
        >
          <video
            className="w-full h-auto block"
            src={promoVideo.url}
            poster={promoPoster.url}
            controls
            playsInline
            loop
            muted
            autoPlay
            preload="metadata"
          />
        </motion.div>
      </div>
    </section>
  );
};

export default DemoVideo;