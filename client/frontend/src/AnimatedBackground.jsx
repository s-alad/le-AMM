import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import './AnimatedBackground.css';

const NUM_TOKENS = 15;
const TOKEN_URLS = [
    '/tokens/eth.svg',
    '/tokens/btc.svg',
    '/tokens/bnt.svg',
    '/tokens/dai.svg',
    '/tokens/sol.svg',
];
const MIN_SIZE = 50;
const MAX_SIZE = 120;
const MIN_DURATION = 20;
const MAX_DURATION = 45;
const MIN_OPACITY = 0.4;
const MAX_OPACITY = 0.8;

const random = (min, max) => Math.random() * (max - min) + min;

const AnimatedBackground = () => {
    const [tokens, setTokens] = useState([]);

    useEffect(() => {
        const generatedTokens = [];
        // const screenWidth = window.innerWidth;
        // const screenHeight = window.innerHeight;

        for (let i = 0; i < NUM_TOKENS; i++) {
            const size = random(MIN_SIZE, MAX_SIZE);
            const url = TOKEN_URLS[Math.floor(Math.random() * TOKEN_URLS.length)];
            const duration = random(MIN_DURATION, MAX_DURATION);
            const delay = 0;
            const opacity = random(MIN_OPACITY, MAX_OPACITY);

            const xKeyframes = [
                `${random(-10, 110)}%`,
                `${random(0, 100)}%`,
                `${random(0, 100)}%`,
                `${random(-10, 110)}%`
            ];
            const yKeyframes = [
                `${random(-10, 110)}%`,
                `${random(0, 100)}%`,
                `${random(0, 100)}%`,
                `${random(-10, 110)}%`
            ];

            generatedTokens.push({
                id: i,
                url,
                style: {
                    width: `${size}px`,
                    height: `${size}px`,
                    top: `${random(0, 100)}%`,
                    left: `${random(0, 100)}%`,
                    backgroundImage: `url(${url})`,
                    opacity: 0,
                    filter: `blur(1px) drop-shadow(0 0 5px rgba(255, 255, 255, 0.3))`
                },
                animate: {
                    x: xKeyframes,
                    y: yKeyframes,
                    rotate: [0, random(-30, 30), random(-30, 30), 0],
                    opacity: [0, opacity, opacity, opacity, 0],
                },
                transition: {
                    duration,
                    delay,
                    repeat: Infinity,
                    repeatType: 'loop',
                    ease: 'linear',
                }
            });
        }

        setTokens(generatedTokens);
    }, []);

    return (
        <div className="animated-background-container">
            {tokens.map(token => (
                <motion.div
                    key={token.id}
                    className="floating-token"
                    style={token.style}
                    initial={{ opacity: 0 }}
                    animate={token.animate}
                    transition={token.transition}
                />
            ))}
        </div>
    );
};

export default AnimatedBackground;
