//SPDX-License-Identifier: MIT
pragma solidity >=0.8.9;

import "./SpaceCoinToken.sol";
import "./SpaceCoinPool.sol";

/**
 * @title SpaceCoinRouter
 * @author Paul Czajka [paul.czajka@gmail.com]
 * @notice Manages interactions with the SpaceCoinToken and SpaceCoinPool
 */
contract SpaceCoinRouter {
    SpaceCoinToken private spc;
    SpaceCoinPool private pool;

    /// Constructor
    /// @param _spc SpaceCoinToken address
    /// @param _pool SpaceCoinPool address
    constructor(address _spc, address _pool) {
        spc = SpaceCoinToken(_spc);
        pool = SpaceCoinPool(_pool);
    }

    /*
     * Liquidity
     */

    /// Add liquidity to the Pool
    /// @param _amountSpc SPC to add
    /// @param _to Address to mint liquidity tokens to
    function addLiquidity(uint256 _amountSpc, address _to) external payable {
        // safely transfer SPC from msg.sender to pool
        spc.transferFrom(msg.sender, address(pool), _amountSpc);
        // mint liquidity tokens, sending any ETH
        pool.mint{value: msg.value}(_to);
    }

    /// Remove liquidity from the Pool
    /// @param _liquidity Liquidity token amount to remove
    /// @param _minAmountSPC Revert if SPC returned is less than this value. Should account for Pool fees and SPC transfer tax.
    /// @param _minAmountETH Revert if ETH returned is less than this value.
    /// @param _to Address to return ETH and SPC to
    function removeLiquidity(
        uint256 _liquidity,
        uint256 _minAmountSPC,
        uint256 _minAmountETH,
        address payable _to
    ) external {
        // transfer msg.sender's liquidity back to the pool
        pool.transferFrom(msg.sender, address(pool), _liquidity);
        // burn liquidity tokens, transfering SPC and ETH if thresholds meet
        pool.burn(_to, _minAmountSPC, _minAmountETH);
    }

    /*
     * Quote
     */

    /// Given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset.
    /// @param amountIn Value of the token being sent in
    /// @param reserveIn Present value of the reserve correlating to amounIn token
    /// @param reserveOut Present value of the reserve correlating to the amountOut token
    /// @return Amount out value
    function _getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256) {
        require(reserveIn > 0 && reserveOut > 0, "INSUFFICIENT_LIQUIDITY");
        require(amountIn > 0, "INSUFFICIENT_AMOUNT");

        uint256 amountInWithFee = amountIn * 99;
        return
            (amountInWithFee * reserveOut) /
            ((reserveIn * 100) + amountInWithFee);
    }

    /// Apply SPC transfer tax, if any exists
    /// @param _spcAmount Value of SPC, pre-tax
    /// @return Value of SPC, post-tax
    function _applySPCTax(uint256 _spcAmount) internal view returns (uint256) {
        return (_spcAmount * (100 - spc.currentTaxPercent())) / 100;
    }

    /// Quote the value of SPC returned for a given ETH input
    /// @param _ethIn ETH input
    /// @return SPC out
    function quoteSwapETHforSPC(uint256 _ethIn) public view returns (uint256) {
        (uint256 spcReserve, uint256 ethReserve) = pool.getReserves();
        // Determine the base swap value including only Pool fees
        uint256 untaxedSpcOut = _getAmountOut(_ethIn, ethReserve, spcReserve);
        // Apply any SPC transfer-tax on the output
        return _applySPCTax(untaxedSpcOut);
    }

    /// Quote the value of ETH returned for a given SPC input
    /// @param _spcIn SPC input
    /// @return ETH out
    function quoteSwapSPCforETH(uint256 _spcIn) public view returns (uint256) {
        (uint256 spcReserve, uint256 ethReserve) = pool.getReserves();
        // Apply SPC transfer tax, which would be taken on the transfer-in to the pool
        uint256 taxedSpcIn = _applySPCTax(_spcIn);
        // Determine the swap value, also including Pool fees
        return _getAmountOut(taxedSpcIn, spcReserve, ethReserve);
    }

    /*
     * Swap
     */

    /// Swap ETH for SPC
    /// @param minSpcOut Revert if the SPC out is less than this threshold
    /// @param _to Address to receive SPC
    function swapETHforSPC(uint256 minSpcOut, address _to) external payable {
        (uint256 spcReserve, uint256 ethReserve) = pool.getReserves();
        // Determine the pre-tax SPC output to pass into the swap method.
        // SPC taxes will get pulled out after conversion, on the transfer out of the pool.
        uint256 spcOutPretax = _getAmountOut(msg.value, ethReserve, spcReserve);

        // Check if the final SPC (including transfer tax) meets min requirement
        require(_applySPCTax(spcOutPretax) >= minSpcOut, "UNMET_MIN_RETURN");

        // Swap by declaring SPC out: the pool validates against ETH sent in
        pool.swapETHforSPC{value: msg.value}(spcOutPretax, _to);
    }

    /// Swap SPC for ETH
    /// @param _spcIn SPC in
    /// @param _minEthOut Revert if the ETH out is less than this threshold
    /// @param _to Address to receive ETH
    function swapSPCforETH(
        uint256 _spcIn,
        uint256 _minEthOut,
        address payable _to
    ) external {
        // quote ETH on the post-taxed value of SPC
        uint256 ethOut = quoteSwapSPCforETH(_spcIn);
        require(ethOut >= _minEthOut, "UNMET_MIN_RETURN");

        // Transfer the pre-taxSPC into the pool, taxes taken out in transit
        spc.transferFrom(msg.sender, address(pool), _spcIn);

        // Swap by declaring ETH out: the pool validates against SPC sent in
        pool.swapSPCforETH(ethOut, _to);
    }
}
