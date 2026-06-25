import React from 'react';
import CountUp from 'react-countup';

interface AnimatedScoreProps {
  value: number;
  duration?: number;
  className?: string;
}

export const AnimatedScore: React.FC<AnimatedScoreProps> = ({ value, duration = 0.8, className }) => {
  return (
    <span className={className}>
      <CountUp
        end={value}
        duration={duration}
        separator=","
        preserveValue={true}
      />
    </span>
  );
};
